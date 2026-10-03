import { expect, test } from "bun:test"
import { ClipSession } from "../../apps/web/src/features/speaker-focus/clip-session"
import type {
  Clip,
  Job,
} from "../../apps/web/src/features/speaker-focus/client.types"

const id = "c".repeat(32)
const clip: Clip = {
  id,
  status: "ready",
  media: {
    width: 320,
    height: 180,
    duration: 32,
    sample_count: 512000,
    frame_count: 480,
  },
  error: null,
  tracks: [
    {
      id: "person",
      manual: false,
      observations: [{ timestamp: 0, box: [0.1, 0.1, 0.2, 0.5] }],
    },
  ],
}
const job: Job = {
  id: "a".repeat(32),
  clip_id: id,
  target_id: "person",
  generation: 2,
  status: "done",
  progress: 1,
  error: null,
  audio_url: `/jobs/${"a".repeat(32)}/audio`,
  preview_url: `/jobs/${"a".repeat(32)}/preview`,
  elapsed_seconds: 23,
  window_p95_seconds: 0.75,
  device: "cpu",
}
function fixture() {
  const removed: string[] = []
  const revoked: string[] = []
  const cancelled: string[] = []
  let loaded = 0
  const video = Object.assign(new EventTarget(), {
    currentTime: 0,
    src: "",
    paused: true,
    load() {},
    pause() {},
    removeAttribute() {},
  }) as unknown as HTMLVideoElement
  const client = {
    clip: async () => clip,
    upload: async () => clip,
    waitForClip: async () => clip,
    remove: async (value: string) => {
      removed.push(value)
    },
    health: async () => {
      throw new Error("Service disconnected")
    },
    extract: async (_id: string, _target: string, generation: number) => ({
      ...job,
      generation,
      status: "queued" as const,
      progress: 0,
      audio_url: null,
      preview_url: null,
    }),
    waitForJob: async () => job,
    cancel: async (value: string) => {
      cancelled.push(value)
    },
    region: async () => clip,
    outputUrl: (path: string) => "http://127.0.0.1:4033" + path,
  }
  const playback = {
    clear() {},
    dispose() {},
    listen: async () => {},
    load: async () => {
      loaded++
    },
    mode: "original" as const,
    ready: false,
    generation: 0,
  }
  const session = new ClipSession(video, {
    client,
    playback,
    createObjectUrl: () => "blob:source",
    revokeObjectUrl: (url) => {
      revoked.push(url)
    },
  })
  return {
    session,
    video,
    client,
    removed,
    revoked,
    cancelled,
    loaded: () => loaded,
  }
}

test("source replacement and route unmount release object URLs and server clips", async () => {
  const f = fixture()
  await f.session.loadFile(
    new File(["video"], "source.mp4", { type: "video/mp4" })
  )
  await f.session.loadFile(
    new File(["next"], "next.mp4", { type: "video/mp4" })
  )
  f.session.dispose()
  await Promise.resolve()
  expect(f.revoked).toEqual(["blob:source", "blob:source"])
  expect(f.removed).toHaveLength(2)
})

test("seek while extracting cancels old generation and rejects its late completion", async () => {
  const f = fixture()
  let complete: (value: Job) => void = () => {}
  f.client.waitForJob = () =>
    new Promise((resolve) => {
      complete = resolve
    })
  await f.session.loadFile(
    new File(["video"], "source.mp4", { type: "video/mp4" })
  )
  const pending = f.session.selectPoint([0.2, 0.3])
  await Promise.resolve()
  await Promise.resolve()
  f.video.dispatchEvent(new Event("seeking"))
  complete(job)
  await pending
  expect(f.cancelled).toHaveLength(1)
  expect(f.loaded()).toBe(0)
  expect(f.session.getSnapshot().selection.selectedId).toBeNull()
  f.session.dispose()
})

test("service loss exposes an error and clears focused playback", async () => {
  const f = fixture()
  await f.session.connect()
  expect(f.session.getSnapshot().serviceError).toContain("Service disconnected")
  expect(f.session.getSnapshot().health).toBeNull()
  f.session.dispose()
})

test("seeking after completed extraction keeps the computed waveform available", async () => {
  const f = fixture()
  const activePlayback = {
    clear() {},
    dispose() {},
    listen: async () => {},
    load: async () => {},
    mode: "focused" as const,
    ready: true,
    generation: 2,
  }
  let clears = 0
  activePlayback.clear = () => {
    clears++
  }
  const session = new ClipSession(f.video, {
    client: f.client,
    playback: activePlayback,
    createObjectUrl: () => "blob:new",
    revokeObjectUrl: () => {},
  })
  await session.loadFile(
    new File(["video"], "source.mp4", { type: "video/mp4" })
  )
  await session.selectPoint([0.2, 0.3])
  const before = clears
  f.video.dispatchEvent(new Event("seeking"))
  expect(clears).toBe(before)
  expect(session.getSnapshot().selection.selectedId).toBe("person")
  session.dispose()
  f.session.dispose()
})

test("development effect remount restores session resource ownership", async () => {
  const f = fixture()
  f.session.dispose()
  f.session.mount()
  await f.session.loadFile(
    new File(["video"], "source.mp4", { type: "video/mp4" })
  )
  expect(f.session.getSnapshot().status).toBe("ready")
  f.session.dispose()
})

test("playback failure exits processing and does not claim a ready focused voice", async () => {
  const f = fixture()
  await f.session.loadFile(
    new File(["video"], "source.mp4", { type: "video/mp4" })
  )
  f.client.waitForJob = () => new Promise(() => {})
  void f.session.selectPoint([0.2, 0.3])
  await Promise.resolve()
  await Promise.resolve()
  f.session.reportError("Playback failed")
  expect(f.session.getSnapshot().status).toBe("ready")
  expect(f.session.getSnapshot().job).toBeNull()
  f.session.dispose()
})

test("a late extraction cannot replace audio after a rapid speaker switch", async () => {
  const f = fixture()
  const two = {
    ...clip,
    tracks: [
      ...clip.tracks,
      {
        id: "other",
        manual: false,
        observations: [
          {
            timestamp: 0,
            box: [0.6, 0.1, 0.2, 0.5] as [number, number, number, number],
          },
        ],
      },
    ],
  }
  f.client.upload = async () => two
  f.client.waitForClip = async () => two
  let complete: (value: Job) => void = () => {}
  let calls = 0
  f.client.waitForJob = async () => {
    calls++
    if (calls === 1) {
      return new Promise((resolve) => {
        complete = resolve
      })
    }
    return {
      ...job,
      target_id: "other",
      generation: f.session.getSnapshot().selection.generation,
    }
  }
  await f.session.loadFile(
    new File(["video"], "source.mp4", { type: "video/mp4" })
  )
  const old = f.session.selectPoint([0.2, 0.3])
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await f.session.selectPoint([0.7, 0.3])
  complete(job)
  await old
  expect(f.loaded()).toBe(1)
  expect(f.session.getSnapshot().job?.target_id).toBe("other")
  f.session.dispose()
})
