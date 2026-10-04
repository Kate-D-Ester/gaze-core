import { expect, test, spyOn } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") {
  GlobalRegistrator.register()
}
import { SceneFacePreview } from "../../apps/web/src/features/speaker-focus/scene-face-preview"
import { LiveController } from "../../apps/web/src/features/speaker-focus/live-controller"
import {
  faceBox,
  FaceLocations,
  matchFaceLocation,
} from "../../apps/web/src/features/speaker-focus/face-locations"
import type { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"

test("preview faces keep their location identity when detector order changes", () => {
  const locations = new FaceLocations()
  const first = locations.update(
    [
      [0.1, 0.1, 0.2, 0.3],
      [0.6, 0.1, 0.2, 0.3],
    ],
    1
  )
  const next = locations.update(
    [
      [0.61, 0.1, 0.2, 0.3],
      [0.11, 0.1, 0.2, 0.3],
    ],
    1.2
  )
  expect(next[0]!.id).toBe(first[1]!.id)
  expect(next[1]!.id).toBe(first[0]!.id)
  const reentered = locations.update([[0.11, 0.1, 0.2, 0.3]], 2)
  expect(reentered[0]!.id).not.toBe(first[0]!.id)
})
test("audio targets are matched by the selected location, never detector order", () => {
  const tracks = [
    {
      id: "right",
      manual: false,
      observations: [{ timestamp: 1, box: [0.6, 0.1, 0.2, 0.3] as const }],
    },
    {
      id: "left",
      manual: false,
      observations: [{ timestamp: 1, box: [0.1, 0.1, 0.2, 0.3] as const }],
    },
  ]
  expect(matchFaceLocation([0.1, 0.1, 0.2, 0.3], tracks, 1)).toBe("left")
  expect(matchFaceLocation([0.1, 0.1, 0.2, 0.3], tracks, 2)).toBeNull()
  expect(
    matchFaceLocation(
      [0.1, 0.1, 0.2, 0.3],
      [...tracks, { ...tracks[1]!, id: "duplicate" }],
      1
    )
  ).toBeNull()
})
test("faces can be previewed and locked before starting the microphone", () => {
  const now = spyOn(performance, "now").mockReturnValue(1000)
  const controller = new LiveController()
  try {
    controller.setEvidence({
      camera: {} as SceneCamera,
      frame: { id: 1, timestamp: 1000, generation: 1, width: 640, height: 480 },
      measurement: null,
      verified: false,
      identity: "preview",
      source: { kind: "camera", key: "camera", name: "USB" },
    })
    controller.setPreviewTracks([
      {
        id: "left",
        manual: false,
        observations: [{ timestamp: 1, box: [0.1, 0.1, 0.2, 0.3] }],
      },
    ])
    controller.select([0.2, 0.2])
    expect(controller.getSnapshot().status).toBe("idle")
    expect(controller.getSnapshot().selection.selectedId).toBe("left")
    expect(controller.getSnapshot().tracks).toHaveLength(1)
  } finally {
    controller.dispose()
    now.mockRestore()
  }
})
test("preview ignores frames from an old camera orientation and closes late bitmaps", async () => {
  let listener: (() => void) | null = null
  const camera = {
    latest: { id: 1, timestamp: 1000, generation: 1, width: 640, height: 480 },
    rawCanvas: document.createElement("canvas"),
    getSnapshot: () => ({
      source: { key: "scene" },
      transform: { rotation: 0, mirrorX: false, mirrorY: false },
    }),
    subscribe: (fn: () => void) => {
      listener = fn
      return () => {
        listener = null
      }
    },
  } as unknown as SceneCamera
  const messages: unknown[] = []
  const worker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (message: unknown) => messages.push(message),
    terminate() {},
  } as unknown as Worker
  let release: (bitmap: ImageBitmap) => void = () => {}
  let closed = 0
  const preview = new SceneFacePreview(
    camera,
    () => worker,
    () =>
      new Promise((resolve) => {
        release = resolve
      })
  )
  preview.start()
  const init = messages[0] as { generation: number }
  worker.onmessage!({
    data: { type: "ready", generation: init.generation },
  } as MessageEvent)
  camera.latest = { ...camera.latest!, generation: 2, id: 2 }
  release({ close: () => closed++ } as ImageBitmap)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(closed).toBe(1)
  expect(messages).toHaveLength(1)
  preview.dispose()
  expect(listener).toBeNull()
})

test("competing face boxes cannot move the locked identity when detection order changes", () => {
  for (const reverse of [false, true]) {
    const locations = new FaceLocations()
    const first = locations.update(
      [
        [0.1, 0.1, 0.3, 0.3],
        [0.3, 0.1, 0.3, 0.3],
      ],
      1
    )
    const current = [
      [0.18, 0.1, 0.3, 0.3],
      [0.14, 0.1, 0.3, 0.3],
    ] as const
    const next = locations.update(
      reverse ? [...current].reverse() : current,
      1.2
    )
    const locked = next.find((track) => track.id === first[0]!.id)
    expect(locked?.observations[0]?.box[0]).toBe(0.14)
    const ambiguous = next.find(
      (track) => track.observations[0]?.box[0] === 0.18
    )
    expect(ambiguous?.id).not.toBe(first[0]!.id)
    expect(ambiguous?.id).not.toBe(first[1]!.id)
  }
})

test("a corrected crop places face landmarks back in physical scene coordinates", () => {
  const box = faceBox(
    [
      [0.1, 0.2],
      [0.5, 0.8],
    ],
    [0.5, 0.2, 0.25, 0.4]
  )!
  expect(box[0]).toBeCloseTo(0.525)
  expect(box[1]).toBeCloseTo(0.28)
  expect(box[2]).toBeCloseTo(0.1)
  expect(box[3]).toBeCloseTo(0.24)
})
test("face correction applies to preview detection and rejects the preceding uncorrected result", async () => {
  const camera = {
    latest: { id: 1, timestamp: 1000, generation: 1, width: 640, height: 480 },
    rawCanvas: document.createElement("canvas"),
    getSnapshot: () => ({
      source: { key: "scene" },
      transform: { rotation: 0, mirrorX: false, mirrorY: false },
    }),
    subscribe: () => () => {},
  } as unknown as SceneCamera
  const messages: Record<string, unknown>[] = []
  const worker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (message: Record<string, unknown>) => messages.push(message),
    terminate() {},
  } as unknown as Worker
  const preview = new SceneFacePreview(
    camera,
    () => worker,
    async () => ({ close() {} }) as ImageBitmap
  )
  preview.start()
  const generation = messages[0]!.generation
  worker.onmessage!({ data: { type: "ready", generation } } as MessageEvent)
  await new Promise((resolve) => setTimeout(resolve, 0))
  preview.correct([0.5, 0.2, 0.25, 0.4])
  worker.onmessage!({
    data: {
      type: "faces",
      generation,
      revision: 0,
      scene: camera.latest,
      boxes: [[0.1, 0.1, 0.2, 0.2]],
    },
  } as MessageEvent)
  expect(preview.getSnapshot().tracks).toHaveLength(0)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const frame = messages.at(-1)!
  expect(frame.region).toEqual([0.5, 0.2, 0.25, 0.4])
  worker.onmessage!({
    data: {
      type: "faces",
      generation,
      revision: frame.revision,
      scene: camera.latest,
      boxes: [[0.525, 0.28, 0.1, 0.24]],
    },
  } as MessageEvent)
  expect(preview.getSnapshot().tracks[0]?.manual).toBe(true)
  expect(preview.getSnapshot().tracks[0]?.observations[0]?.box[0]).toBe(0.525)
  preview.start()
  const retryGeneration = messages.at(-1)!.generation
  worker.onmessage!({
    data: { type: "ready", generation: retryGeneration },
  } as MessageEvent)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(messages.at(-1)!.region).toEqual([0.5, 0.2, 0.25, 0.4])
  preview.dispose()
})

test("a camera transport retry preserves the corrected face region", async () => {
  let listener: (() => void) | null = null
  const camera = {
    latest: { id: 1, timestamp: 1000, generation: 1, width: 640, height: 480 },
    rawCanvas: document.createElement("canvas"),
    getSnapshot: () => ({
      source: { key: "same-camera" },
      transform: { rotation: 0, mirrorX: false, mirrorY: false },
    }),
    subscribe: (fn: () => void) => {
      listener = fn
      return () => {
        listener = null
      }
    },
  } as unknown as SceneCamera
  const messages: Record<string, unknown>[] = []
  const worker = {
    onmessage: null,
    postMessage: (message: Record<string, unknown>) => messages.push(message),
    terminate() {},
  } as unknown as Worker
  const preview = new SceneFacePreview(
    camera,
    () => worker,
    async () => ({ close() {} }) as ImageBitmap
  )
  try {
    preview.start()
    const generation = messages[0]!.generation
    preview.correct([0.5, 0.2, 0.25, 0.4])
    worker.onmessage!({ data: { type: "ready", generation } } as MessageEvent)
    await Promise.resolve()
    worker.onmessage!({
      data: {
        type: "faces",
        generation,
        revision: messages.at(-1)!.revision,
        scene: camera.latest,
        boxes: [],
      },
    } as MessageEvent)
    camera.latest = null
    listener!()
    camera.latest = {
      id: 2,
      timestamp: 2000,
      generation: 2,
      width: 640,
      height: 480,
    }
    listener!()
    await Promise.resolve()
    expect(messages.at(-1)!.region).toEqual([0.5, 0.2, 0.25, 0.4])
    expect(messages.at(-1)!.scene).toEqual(camera.latest)
  } finally {
    preview.dispose()
  }
})
