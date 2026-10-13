import { expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") GlobalRegistrator.register()
import { ObjectTracking } from "../../apps/web/src/features/camera-viewer/object-tracking"
import { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"
import { TargetFollower } from "../../apps/web/src/features/robot-control/target-follower"
import { liveSnapshot } from "../camera-viewer/fixtures"
import type { ObjectBox } from "../../apps/web/src/features/camera-viewer/object-tracking.types"
const settings = { desiredWidth: 0.3, speed: 25 }
async function fixture() {
  let now = 100,
    box: ObjectBox = [0.65, 0.35, 0.95, 0.65],
    present = true
  const scene = new SceneCamera(),
    target = new SceneCamera(),
    s = liveSnapshot(),
    t = liveSnapshot()
  s.frame!.timestamp = t.frame!.timestamp = now
  t.source!.key = "target"
  scene.getSnapshot = () => s
  target.getSnapshot = () => t
  const session = {
    state: {
      connected: true,
      connecting: false,
      online: true,
      canControl: true,
      joined: true,
      authority: "boot:2:guest:true:false",
      error: "",
    },
    sent: [] as string[],
    guards: [] as (() => boolean)[],
    getSnapshot() {
      return this.state
    },
    async move(
      action: string,
      cmd: string,
      speed: number,
      guard: () => boolean
    ) {
      this.guards.push(guard)
      if (guard()) this.sent.push(cmd)
    },
    cancelMotion() {},
    async stop() {
      this.sent.push("S")
    },
  }
  const tracker = new ObjectTracking({
    now: () => now,
    encode: () => "jpeg",
    request: async (req) =>
      req.action === "select"
        ? { token: "selection", box: [0.1, 0.2, 0.4, 0.6], label: "Object" }
        : req.action === "clear"
          ? {}
          : present
            ? { status: "matched", box, score: 0.95, method: "temporal" }
            : { status: "searching" },
  })
  await tracker.select(scene, { box: [0.1, 0.2, 0.4, 0.6] })
  const follower = new TargetFollower(
    session,
    tracker,
    scene,
    target,
    () => now
  )
  follower.enable(settings)
  async function frame(next?: ObjectBox) {
    if (next) box = next
    now += 100
    s.frame = { ...s.frame!, timestamp: now, id: s.frame!.id + 1 }
    t.frame = { ...t.frame!, timestamp: now, id: t.frame!.id + 1 }
    await tracker.tick(scene, target)
    follower.tick()
    await Promise.resolve()
    await Promise.resolve()
  }
  return {
    follower,
    tracker,
    session,
    scene,
    target,
    s,
    t,
    frame,
    setPresent: (value: boolean) => (present = value),
    setTime: (value: number) => (now = value),
  }
}
test("the real tracker must confirm two distinct Target results before moving", async () => {
  const f = await fixture()
  await f.frame()
  expect(f.session.sent.filter((cmd) => cmd !== "S")).toHaveLength(0)
  await f.frame()
  expect(f.session.sent.at(-1)).toBe("R")
  await f.frame([0.35, 0.35, 0.65, 0.65])
  expect(f.session.sent.at(-1)).toBe("S")
  f.follower.disable()
  f.tracker.clear()
})
test("forward and backward derive from Target width, not the Scene selection", async () => {
  const f = await fixture()
  await f.frame([0.45, 0.35, 0.55, 0.65])
  await f.frame()
  expect(f.session.sent.at(-1)).toBe("F")
  await f.frame([0.25, 0.35, 0.75, 0.65])
  expect(f.session.sent.at(-1)).toBe("B")
  f.follower.disable()
  f.tracker.clear()
})
test("lost targets stop immediately and resume only after two fresh reacquisition results", async () => {
  const f = await fixture()
  await f.frame()
  await f.frame()
  f.setPresent(false)
  await f.frame()
  expect(f.session.sent.at(-1)).toBe("S")
  expect(f.follower.getSnapshot().enabled).toBe(true)
  f.setPresent(true)
  const count = f.session.sent.length
  await f.frame()
  expect(f.session.sent.length).toBe(count)
  await f.frame()
  expect(f.session.sent.at(-1)).toBe("R")
  f.follower.disable()
  f.tracker.clear()
})
test("fresh camera pixels cannot refresh an expired inference box", async () => {
  const f = await fixture()
  await f.frame()
  await f.frame()
  f.setTime(901)
  f.t.frame = { ...f.t.frame!, timestamp: 901, id: 20 }
  f.follower.tick()
  expect(f.session.sent.at(-1)).toBe("S")
  expect(f.follower.getSnapshot().phase).toBe("waiting")
  expect(f.session.guards.at(-1)!()).toBe(false)
  f.follower.disable()
  f.tracker.clear()
})
test("clear, camera replacement, or ownership change disables following", async () => {
  for (const reason of ["clear", "source", "authority"]) {
    const f = await fixture()
    await f.frame()
    await f.frame()
    if (reason === "clear") f.tracker.clear()
    if (reason === "source") f.t.source!.key = "replacement"
    if (reason === "authority") f.session.state.authority = "new ownership"
    f.follower.tick()
    expect(f.follower.getSnapshot().enabled).toBe(false)
    expect(f.session.sent.at(-1)).toBe("S")
    f.tracker.clear()
  }
})
test("a motion guard becomes invalid as soon as following is stopped", async () => {
  const f = await fixture()
  await f.frame()
  await f.frame()
  const guard = f.session.guards.at(-1)!
  expect(guard()).toBe(true)
  f.follower.disable()
  expect(guard()).toBe(false)
  f.tracker.clear()
})
test("renewal is bounded to 250 ms and stops after the 500 ms observation deadline", async () => {
  const f = await fixture()
  await f.frame()
  await f.frame()
  const count = f.session.sent.filter((cmd) => cmd === "R").length
  f.setTime(400)
  f.follower.tick()
  await Promise.resolve()
  expect(f.session.sent.filter((cmd) => cmd === "R").length).toBe(count)
  f.setTime(550)
  f.t.frame = { ...f.t.frame!, timestamp: 550 }
  f.follower.tick()
  await Promise.resolve()
  expect(f.session.sent.filter((cmd) => cmd === "R").length).toBe(count + 1)
  f.setTime(801)
  f.t.frame = { ...f.t.frame!, timestamp: 801 }
  f.follower.tick()
  expect(f.session.sent.at(-1)).toBe("S")
  f.follower.disable()
  f.tracker.clear()
})

test("a newer valid observation during signing does not permanently turn following off", async () => {
  const f = await fixture()
  let reject!: (error: Error) => void,
    first = true
  const move = f.session.move.bind(f.session)
  f.session.move = async (action, cmd, speed, guard) => {
    if (first) {
      first = false
      return new Promise<void>((resolve, fail) => {
        reject = fail
      })
    }
    return move(action, cmd, speed, guard)
  }
  await f.frame()
  await f.frame()
  await f.frame()
  reject(new Error("old observation cancelled"))
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  expect(f.follower.getSnapshot().enabled).toBe(true)
  f.follower.tick()
  await Promise.resolve()
  expect(f.session.sent.at(-1)).toBe("R")
  f.follower.disable()
  f.tracker.clear()
})

test("an existing pre-enable match does not count as a new post-enable confirmation", async () => {
  const f = await fixture()
  await f.frame()
  await f.frame()
  f.follower.disable()
  const count = f.session.sent.filter((cmd) => cmd === "R").length
  f.follower.enable(settings)
  await f.frame()
  expect(f.session.sent.filter((cmd) => cmd === "R").length).toBe(count)
  await f.frame()
  expect(f.session.sent.filter((cmd) => cmd === "R").length).toBe(count + 1)
  f.follower.disable()
  f.tracker.clear()
})
test("the publication guard rejects a Scene orientation change before the next scheduler tick", async () => {
  const f = await fixture()
  await f.frame()
  await f.frame()
  const guard = f.session.guards.at(-1)!
  f.s.transform = { ...f.s.transform, rotation: 90 }
  expect(guard()).toBe(false)
  f.follower.disable()
  f.tracker.clear()
})
