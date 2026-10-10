import {
  fixtureEyeFeature,
  fixtureCalibrationSamples,
  fixtureMotionPoses,
  fixtureReference,
} from "./head-motion-fixture"
import { expect, test } from "bun:test"
import { CalibrationSession } from "../../apps/web/src/features/eye-tracking/calibration-session"
import {
  fitCalibration,
  mapGaze,
} from "../../apps/web/src/features/eye-tracking/calibration"
import type { Point } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
import type { HeadPose } from "../../apps/web/src/features/eye-tracking/head-tracking/head-pose.types"

const face: HeadPose = {
  id: 1,
  timestamp: 0,
  position: [0, 0, -50],
  rotation: [0, 0, 0],
}
const directions: Point[] = [
  [0.04, 0.04],
  [0.96, 0.04],
  [0.96, 0.96],
  [0.04, 0.96],
  [0.5, 0.04],
  [0.96, 0.5],
  [0.5, 0.96],
  [0.04, 0.5],
  [0.5, 0.5],
]
function featureAt(target: Point): Point {
  return [-(target[0] - 0.5) / 2, (target[1] - 0.5) / 3]
}
function feed(
  session: CalibrationSession,
  feature: Point,
  start: number
): number {
  let time = start
  for (let index = 0; index < 30; index++) {
    time += 100
    session.observe({ id: time, timestamp: time, feature }, time)
    if (session.snapshot.phase !== "fixation") break
  }
  return time
}
function next(session: CalibrationSession, time: number): number {
  session.observe(null, time + 300)
  return time + 300
}

test("waits for Start, and duplicate or stale frames cannot finish a fixation", () => {
  const session = new CalibrationSession({ headEnabled: false })
  expect(session.snapshot.phase).toBe("intro")
  session.start(0)
  for (let time = 0; time < 3000; time += 50)
    session.observe({ id: 1, timestamp: 0, feature: [0, 0] }, time)
  expect(session.snapshot.phase).toBe("fixation")
  expect(session.snapshot.progress).toBe(0)
})

test("every corner and edge rejects steady gaze in every other direction", () => {
  const session = new CalibrationSession({ headEnabled: false })
  session.start(0)
  let time = next(session, feed(session, [0, 0], 0))
  for (let point = 1; point < 9; point++) {
    const target = session.snapshot.target
    for (const wrong of directions) {
      if (wrong[0] === target[0] && wrong[1] === target[1]) continue
      time = feed(session, featureAt(wrong), time)
      expect(session.samples).toHaveLength(point)
      expect(session.snapshot.progress).toBe(0)
      if (session.snapshot.retryable) session.retryCurrentTarget(time)
    }
    time = feed(session, featureAt(target), time)
    expect(session.samples).toHaveLength(point + 1)
    time = next(session, time)
  }
  expect(session.snapshot.phase).toBe("complete")
})

test("center jitter is not a direction and looking away resets partially collected dwell", () => {
  const session = new CalibrationSession({ headEnabled: false })
  session.start(0)
  let time = next(session, feed(session, [0, 0], 0))
  time = feed(session, [0.001, -0.001], time)
  expect(session.snapshot.progress).toBe(0)
  for (let index = 0; index < 6; index++) {
    time += 100
    session.observe(
      {
        id: time,
        timestamp: time,
        feature: featureAt(session.snapshot.target),
      },
      time
    )
  }
  expect(session.snapshot.progress).toBeGreaterThan(0)
  time += 100
  session.observe({ id: time, timestamp: time, feature: [-0.2, -0.1333] }, time)
  expect(session.snapshot.progress).toBe(0)
  expect(session.samples).toHaveLength(1)
})

test("camera orientation is explicit rather than inferred from an arbitrary fixation", () => {
  const session = new CalibrationSession({
    headEnabled: false,
    orientation: { horizontal: 1, vertical: -1 },
  })
  session.start(0)
  let time = next(session, feed(session, [0, 0], 0))
  time = feed(session, [0.2, 0.1333], time)
  expect(session.samples).toHaveLength(1)
  feed(session, [-0.2, 0.1333], time)
  expect(session.samples).toHaveLength(2)
})

test("head mode cannot collect without a synchronized face", () => {
  const session = new CalibrationSession({ headEnabled: true })
  session.start(0)
  for (let time = 0; time < 3000; time += 50)
    session.observe({ id: time, timestamp: time, feature: [0, 0] }, time)
  expect(session.snapshot.progress).toBe(0)
  expect(session.samples).toHaveLength(0)
})

test("eye-only calibration retains the normal nine-dot flow", () => {
  const session = new CalibrationSession({ headEnabled: false })
  session.start(0)
  for (
    let time = 100;
    time < 30000 && session.snapshot.phase !== "complete";
    time += 100
  ) {
    session.observe(
      {
        id: time,
        timestamp: time,
        feature: featureAt(session.snapshot.target),
      },
      time
    )
  }
  expect(session.snapshot.phase).toBe("complete")
  expect(session.samples).toHaveLength(9)
  expect(fitCalibration(session.samples)?.headCompensation).toBeUndefined()
})

test("head calibration cannot finish from a stationary grid; the guided pass collects both sides of all six axes", () => {
  const session = new CalibrationSession({ headEnabled: true })
  session.start(0)
  let time = 0
  for (; time < 30000 && session.samples.length < 9; time += 100) {
    const headPose = { ...fixtureReference, timestamp: time }
    session.observe(
      {
        id: time,
        timestamp: time,
        feature: fixtureEyeFeature(session.snapshot.target, headPose),
        headPose,
      },
      time
    )
  }
  expect(session.samples).toHaveLength(9)
  session.observe(null, time + 300)
  time += 300
  for (let index = 0; index < 30; index++) {
    time += 100
    session.observe(
      {
        id: time,
        timestamp: time,
        feature: fixtureEyeFeature([0.5, 0.5], fixtureReference),
        headPose: { ...fixtureReference, timestamp: time },
      },
      time
    )
  }
  expect(session.samples).toHaveLength(9)
  expect(session.snapshot.phase).toBe("fixation")
  for (const originalPose of fixtureMotionPoses().slice(1)) {
    for (let count = 0; count < 30; count++) {
      time += 100
      const headPose = { ...originalPose, timestamp: time }
      session.observe(
        {
          id: time,
          timestamp: time,
          feature: fixtureEyeFeature([0.5, 0.5], headPose),
          headPose,
        },
        time
      )
      if (session.snapshot.phase === "burst") break
    }
    expect(session.snapshot.phase).toBe("burst")
    session.observe(null, time + 300)
    time += 300
  }
  expect(session.snapshot.phase).toBe("complete")
  expect(session.samples).toHaveLength(21)
  const calibration = fitCalibration(session.samples)
  expect(calibration).not.toBeNull()
  const pose = {
    ...fixtureReference,
    position: [1.5, -1.5, -52],
    rotation: [0.07, -0.08, 0.06],
  } as HeadPose
  const target: Point = [0.8, 0.2]
  const point = mapGaze(calibration!, fixtureEyeFeature(target, pose), pose)!
  expect(Math.hypot(point[0] - target[0], point[1] - target[1])).toBeLessThan(
    0.02
  )
})

test("unregistered head movement is rejected during the initial grid instead of applying guessed compensation", () => {
  const session = new CalibrationSession({ headEnabled: true })
  session.start(0)
  for (let time = 100; time < 1000; time += 100) {
    session.observe(
      {
        id: time,
        timestamp: time,
        feature: [0, 0],
        headPose: { ...face, timestamp: time },
      },
      time
    )
  }
  for (let time = 1000; time < 4000; time += 100) {
    session.observe(
      {
        id: time,
        timestamp: time,
        feature: [0, 0],
        headPose: { ...face, timestamp: time, position: [5, 0, -50] },
      },
      time
    )
  }
  expect(session.samples).toHaveLength(0)
  expect(session.snapshot.instruction).toContain("head centered")
})

test("retrying head movements reuses the completed gaze grid without collecting it again", () => {
  const grid = fixtureCalibrationSamples().slice(0, 9)
  const session = new CalibrationSession({
    headEnabled: true,
    seedSamples: grid,
  })
  session.start(0)
  expect(session.samples).toEqual(grid)
  expect(session.snapshot.label).toBe("HEAD MOVEMENT · 1 / 12")
  const poses = fixtureMotionPoses().slice(1)
  let time = 0
  for (const pose of poses) {
    for (let reading = 0; reading < 30; reading++) {
      time += 100
      const headPose = { ...pose, timestamp: time }
      session.observe(
        {
          id: time,
          timestamp: time,
          feature: fixtureEyeFeature([0.5, 0.5], headPose),
          headPose,
        },
        time
      )
      if (session.snapshot.phase === "burst") break
    }
    expect(session.snapshot.phase).toBe("burst")
    time = next(session, time)
  }
  expect(session.snapshot.phase).toBe("complete")
  expect(session.samples).toHaveLength(21)
  expect(session.samples.slice(0, 9)).toEqual(grid)
  expect(grid).toHaveLength(9)
  expect(fitCalibration(session.samples)?.headCompensation).toBeDefined()
})

test("a partial saved grid cannot silently begin a head-only calibration", () => {
  const session = new CalibrationSession({
    headEnabled: true,
    seedSamples: fixtureCalibrationSamples().slice(0, 4),
  })
  session.start(0)
  expect(session.snapshot.phase).toBe("error")
  expect(session.samples).toHaveLength(0)
})

test("the grid uses the averaged center head pose as the same baseline used by fitting", () => {
  const session = new CalibrationSession({ headEnabled: true })
  session.start(0)
  let time = 100
  for (; time < 4000; time += 100) {
    const headPose = {
      ...fixtureReference,
      timestamp: time,
      position: [time <= 700 ? 0 : 1.75, 0, -50],
    } as HeadPose
    session.observe(
      {
        id: time,
        timestamp: time,
        feature: fixtureEyeFeature([0.5, 0.5], headPose),
        headPose,
      },
      time
    )
    if (session.snapshot.phase === "burst") break
  }
  expect(session.samples).toHaveLength(1)
  expect(session.samples[0].headPose!.position[0]).toBeGreaterThan(1.5)
  time = next(session, time)
  const target = session.snapshot.target
  for (let reading = 0; reading < 30; reading++) {
    time += 100
    const headPose = {
      ...fixtureReference,
      timestamp: time,
      position: [-1.75, 0, -50],
    } as HeadPose
    session.observe(
      {
        id: time,
        timestamp: time,
        feature: fixtureEyeFeature(target, headPose),
        headPose,
      },
      time
    )
  }
  expect(session.samples).toHaveLength(1)
  expect(session.snapshot.instruction).toBe(
    "Keep your head centered for these dots"
  )
})

test("a cardinal gaze with small off-axis drift cannot pop a corner", () => {
  const session = new CalibrationSession({ headEnabled: false })
  session.start(0)
  const time = next(session, feed(session, [0, 0], 0))
  feed(session, [0.2, -0.001], time)
  expect(session.samples).toHaveLength(1)
  expect(session.snapshot.progress).toBe(0)
})

test("corner direction checks account for a wide viewport", () => {
  const session = new CalibrationSession({
    headEnabled: false,
    screenAspectRatio: 5,
  })
  session.start(0)
  const time = next(session, feed(session, [0, 0], 0))
  feed(session, [0.2, -0.04], time)
  expect(session.samples).toHaveLength(2)
})

test("validation measures noisy raw readings without prediction stability gates", () => {
  const session = new CalibrationSession({
    headEnabled: false,
    validation: {
      coefficients: [
        [0, 20, 0],
        [0, 0, 20],
      ],
      validationError: 0,
    },
    targets: [[0.5, 0.5]],
  })
  session.start(0)
  for (let time = 100; time <= 3000; time += 100)
    session.observe(
      { id: time, timestamp: time, feature: [time % 200 ? 0.035 : -0.035, 0] },
      time
    )
  expect(session.snapshot.phase).toBe("complete")
  expect(session.samples).toHaveLength(1)
  expect(session.samples[0].measurements!.length).toBeGreaterThanOrEqual(12)
})

test("validation advances on an outage without inventing a sample", () => {
  const session = new CalibrationSession({
    headEnabled: false,
    validation: {
      coefficients: [
        [0, 1, 0],
        [0, 0, 1],
      ],
      validationError: 0,
    },
    targets: [[0.5, 0.5]],
  })
  session.start(0)
  for (let time = 100; time <= 9000; time += 100) session.observe(null, time)
  expect(session.snapshot.phase).toBe("complete")
  expect(session.samples).toHaveLength(0)
})

test("validation duplicate frames cannot satisfy the reading count", () => {
  const session = new CalibrationSession({
    headEnabled: false,
    validation: {
      coefficients: [
        [0, 1, 0],
        [0, 0, 1],
      ],
      validationError: 0,
    },
    targets: [[0.5, 0.5]],
  })
  session.start(0)
  for (let time = 700; time < 3000; time += 100)
    session.observe({ id: 1, timestamp: time, feature: [0, 0] }, time)
  expect(session.snapshot.phase).toBe("fixation")
  expect(session.samples).toHaveLength(0)
})

test("screen profiles accept the real eight-dimensional head regression input", async () => {
  const { isScreenCalibration } =
    await import("../../apps/web/src/features/eye-tracking/calibration-profile-adapter")
  const calibration = fitCalibration(fixtureCalibrationSamples())!
  const { fitHeadPoseMapping } =
    await import("../../apps/web/src/features/eye-tracking/head-tracking/head-pose-mapping")
  const mapping = fitHeadPoseMapping(
    fixtureCalibrationSamples().map((sample) => ({
      feature: sample.feature,
      target: sample.target,
      pose: sample.headPose!,
      weight: 1,
    })),
    fixtureReference
  )
  expect(mapping).not.toBeNull()
  const { geometry: _geometry, ...head } =
    calibration.headCompensation as Extract<
      NonNullable<typeof calibration.headCompensation>,
      { method: "calibrated-ray-plane" }
    >
  expect(
    isScreenCalibration({
      ...calibration,
      headCompensation: {
        ...head,
        method: "calibrated-pose-regression",
        mapping,
      },
    })
  ).toBe(true)
})

test("a lost head pass is bounded and retains the completed gaze grid", () => {
  const grid = fixtureCalibrationSamples().slice(0, 9)
  const session = new CalibrationSession({
    headEnabled: true,
    seedSamples: grid,
  })
  session.start(0)
  session.observe(null, 20000)
  expect(session.snapshot.phase).toBe("error")
  expect(session.samples).toEqual(grid)
  expect(session.snapshot.instruction).toContain("eye-only")
})

test("timed-out calibration retries the same dot and retains completed points", () => {
  const session = new CalibrationSession({ headEnabled: false })
  session.start(0)
  const time = next(session, feed(session, [0, 0], 0))
  const target = session.snapshot.target
  session.observe(null, time + 20000)
  expect(session.snapshot.phase).toBe("error")
  expect(session.snapshot.retryable).toBe(true)
  session.retryCurrentTarget(time + 20001)
  expect(session.snapshot.phase).toBe("fixation")
  expect(session.snapshot.target).toEqual(target)
  expect(session.samples).toHaveLength(1)
  feed(session, featureAt(target), time + 20001)
  expect(session.samples).toHaveLength(2)
})
