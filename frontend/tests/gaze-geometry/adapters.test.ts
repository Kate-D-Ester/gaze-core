import { expect, test } from "bun:test"
import {
  eyeCenteredDirectionToCamera,
  projectNearEyeGaze,
  projectRemoteGaze,
} from "../../research/gaze-3d/browser/gaze-adapters"
import type {
  CameraGazeMeasurement,
  NearEyeRig,
} from "../../research/gaze-3d/browser/gaze-adapters.types"
import type { MetricScreen } from "../../research/gaze-3d/browser/gaze-geometry.types"

const screen: MetricScreen = {
  centerMetres: [0, 0, 0],
  right: [1, 0, 0],
  down: [0, 1, 0],
  widthMetres: 0.4,
  heightMetres: 0.25,
  pixelWidth: 1600,
  pixelHeight: 1000,
}
const rig: NearEyeRig = {
  headFromEyeCamera: {
    rotation: [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
    translationMetres: [0.01, 0.02, 0.03],
  },
  cameraFromHead: {
    rotation: [
      [0, 0, 1],
      [0, 1, 0],
      [-1, 0, 0],
    ],
    translationMetres: [0.1, 0.2, 0.6],
  },
  headTimestamp: 1000,
  maxTimestampSkewMs: 20,
}

test("remote camera-frame rays reach screen coordinates without another head rotation", () => {
  const measurement: CameraGazeMeasurement = {
    frame: "opencv-camera",
    units: "metres",
    timestamp: 1000,
    ray: { originMetres: [0.1, 0, 0.6], direction: [-0.1, 0, -0.6] },
  }
  const result = projectRemoteGaze(measurement, screen)
  expect(result.kind).toBe("projected")
  if (result.kind === "projected") {
    expect(result.normalized).toEqual([0.5, 0.5])
  }
  expect(
    projectRemoteGaze(
      { ...measurement, frame: "head" } as unknown as CameraGazeMeasurement,
      screen
    )
  ).toEqual({ kind: "unavailable", reason: "invalid-measurement" })
})

test("near-eye mounting and head transforms compose in the correct order", () => {
  // Mount sends origin to [.11,.02,.03]; head sends it to [.13,.22,.49].
  // Mount sends direction to [1,0,0]; head sends it to [0,0,-1].
  const result = projectNearEyeGaze(
    {
      frame: "eye-camera",
      units: "metres",
      timestamp: 1000,
      ray: { originMetres: [0, -0.1, 0], direction: [0, -1, 0] },
    },
    rig,
    screen
  )
  expect(result.kind).toBe("projected")
  if (result.kind === "projected") {
    expect(result.normalized[0]).toBeCloseTo(0.825, 12)
    expect(result.normalized[1]).toBeCloseTo(1.38, 12)
    expect(result.outside).toBe(true)
  }
})

test("missing registration and stale head measurements cannot fabricate compensation", () => {
  const measurement = {
    frame: "eye-camera" as const,
    units: "metres" as const,
    timestamp: 1000,
    ray: {
      originMetres: [0, 0, 0] as [number, number, number],
      direction: [0, -1, 0] as [number, number, number],
    },
  }
  expect(projectNearEyeGaze(measurement, null, screen)).toEqual({
    kind: "unavailable",
    reason: "missing-registration",
  })
  expect(
    projectNearEyeGaze(measurement, { ...rig, headTimestamp: 1050 }, screen)
  ).toEqual({ kind: "unavailable", reason: "unsynchronized-pose" })
  expect(
    projectNearEyeGaze(
      measurement,
      { ...rig, maxTimestampSkewMs: Infinity },
      screen
    )
  ).toEqual({ kind: "unavailable", reason: "invalid-registration" })
})

test("missing nested rig transforms return an explicit unavailable result", () => {
  const measurement = {
    frame: "eye-camera" as const,
    units: "metres" as const,
    timestamp: 1000,
    ray: {
      originMetres: [0, 0, 0] as [number, number, number],
      direction: [0, -1, 0] as [number, number, number],
    },
  }
  const incomplete = {
    headTimestamp: 1000,
    maxTimestampSkewMs: 20,
  } as NearEyeRig
  expect(projectNearEyeGaze(measurement, incomplete, screen)).toEqual({
    kind: "unavailable",
    reason: "invalid-registration",
  })
})

test("explicit eye-centered axes are converted once into OpenCV camera axes", () => {
  expect(
    eyeCenteredDirectionToCamera(
      { frame: "eye-centered-toward-camera", direction: [0, 0, 2] },
      [0, 0, 0.6]
    )
  ).toEqual([0, 0, -1])
  expect(
    eyeCenteredDirectionToCamera(
      { frame: "eye-centered-toward-camera", direction: [1, 0, 0] },
      [0, 0, 0.6]
    )
  ).toEqual([1, 0, 0])
  expect(
    eyeCenteredDirectionToCamera(
      { frame: "eye-centered-toward-camera", direction: [0, 1, 0] },
      [0, 0, 0.6]
    )
  ).toEqual([0, -1, 0])
  const towardCamera = eyeCenteredDirectionToCamera(
    { frame: "eye-centered-toward-camera", direction: [0, 0, 1] },
    [0.3, 0, 0.4]
  )!
  expect(towardCamera[0]).toBeCloseTo(-0.6, 12)
  expect(towardCamera[2]).toBeCloseTo(-0.8, 12)
  expect(
    eyeCenteredDirectionToCamera(
      { frame: "eye-centered-toward-camera", direction: [0, 0, 1] },
      [0, 0, 0]
    )
  ).toBeNull()
})
