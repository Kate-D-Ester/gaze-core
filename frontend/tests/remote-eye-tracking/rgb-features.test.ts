import { describe, expect, test } from "bun:test"
import {
  buildRgbFeatures,
  extractRgbEyePatch,
  inspectRgbFace,
  modelPredictionToScreen,
  prepareBlazeGazeGeometry,
  type RgbFaceResult,
} from "../../apps/web/src/features/remote-eye-tracking/rgb-features"

function face(yaw = 0): RgbFaceResult {
  const landmarks = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }))
  const point = (index: number, x: number, y: number) => {
    landmarks[index] = { x, y, z: 0 }
  }
  point(4, 0.5, 0.5)
  point(10, 0.5, 0.15)
  point(152, 0.5, 0.8)
  point(127, 0.25, 0.45)
  point(356, 0.75, 0.45)
  point(103, 0.28, 0.25)
  point(150, 0.28, 0.7)
  point(332, 0.72, 0.25)
  point(379, 0.72, 0.7)
  point(151, 0.5, 0.35)
  point(195, 0.5, 0.49)
  for (const [start, end, iris, x] of [
    [33, 133, 468, 0.39],
    [362, 263, 473, 0.61],
  ]) {
    point(start, x - 0.04, 0.42)
    point(end, x + 0.04, 0.42)
    point(iris, x, 0.42)
    point(iris + 1, x + 0.008, 0.42)
    point(iris + 2, x, 0.42 - (0.008 * 4) / 3)
    point(iris + 3, x - 0.008, 0.42)
    point(iris + 4, x, 0.42 + (0.008 * 4) / 3)
  }
  for (const [a, b, c, d, x] of [
    [158, 160, 144, 153, 0.39],
    [385, 387, 373, 380, 0.61],
  ]) {
    point(a, x - 0.02, 0.435)
    point(b, x + 0.02, 0.435)
    point(c, x + 0.02, 0.405)
    point(d, x - 0.02, 0.405)
  }
  return {
    faceLandmarks: [landmarks],
    facialTransformationMatrixes: [
      {
        rows: 4,
        columns: 4,
        data: [
          Math.cos(yaw),
          0,
          -Math.sin(yaw),
          0,
          0,
          1,
          0,
          0,
          Math.sin(yaw),
          0,
          Math.cos(yaw),
          0,
          0,
          0,
          0,
          1,
        ],
      },
    ],
    faceBlendshapes: [],
  }
}

function validGeometry(result = face(), width = 640, height = 480) {
  const geometry = inspectRgbFace(result, width, height)
  if (!geometry.valid) throw new Error(geometry.reason)
  return geometry
}

describe("RGB observations", () => {
  test("reports pixel geometry and normalized positive pose scale", () => {
    const geometry = validGeometry()
    expect(geometry.eyes[0].center[0]).toBeCloseTo(249.6)
    expect(geometry.eyes[0].center[1]).toBeCloseTo(201.6)
    expect(geometry.eyes[0].radius).toBeCloseTo(5.12)
    expect(geometry.faceBox.width).toBeCloseTo(320)
    expect(geometry.pose.kind).toBe("face")
    expect(geometry.pose.x).toBeCloseTo(0.5)
    expect(geometry.pose.y).toBeCloseTo(0.42)
    expect(geometry.pose.scale).toBeCloseTo(0.22)
  })

  test("extracts yaw in radians without confusing it with pitch", () => {
    const geometry = validGeometry(face(0.3))
    expect(geometry.pose.yaw).toBeCloseTo(0.3)
    expect(geometry.pose.pitch).toBeCloseTo(0)
    expect(geometry.pose.roll).toBeCloseTo(0)
  })

  test("head translation and scale stay independent of iris movement", () => {
    const neutral = validGeometry()
    const glance = face()
    for (let i = 468; i <= 477; i++) glance.faceLandmarks[0][i].x += 0.005
    const changed = validGeometry(glance)
    expect(changed.pose.x).toBeCloseTo(neutral.pose.x, 10)
    expect(changed.pose.y).toBeCloseTo(neutral.pose.y, 10)
    expect(changed.pose.scale).toBeCloseTo(neutral.pose.scale, 10)
    expect(changed.irisOffsets).not.toEqual(neutral.irisOffsets)
    expect(changed.eyes[0].center[0]).toBeGreaterThan(neutral.eyes[0].center[0])
  })

  test("extracts pitch and roll in radians", () => {
    const pitched = face(),
      rolled = face()
    pitched.facialTransformationMatrixes[0].data = [
      1,
      0,
      0,
      0,
      0,
      Math.cos(0.25),
      -Math.sin(0.25),
      0,
      0,
      Math.sin(0.25),
      Math.cos(0.25),
      0,
      0,
      0,
      0,
      1,
    ]
    rolled.facialTransformationMatrixes[0].data = [
      Math.cos(-0.4),
      -Math.sin(-0.4),
      0,
      0,
      Math.sin(-0.4),
      Math.cos(-0.4),
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    ]
    for (const fixture of [pitched, rolled]) {
      const rowMajor = fixture.facialTransformationMatrixes[0].data
      fixture.facialTransformationMatrixes[0].data = rowMajor.map(
        (_, i) => rowMajor[(i % 4) * 4 + Math.floor(i / 4)]
      )
    }
    expect(validGeometry(pitched).pose.pitch).toBeCloseTo(0.25)
    expect(validGeometry(rolled).pose.roll).toBeCloseTo(-0.4)
  })

  test("calibration features are resolution invariant", () => {
    const small = buildRgbFeatures("webcam", validGeometry(), [0.2, 0.8])
    const large = buildRgbFeatures(
      "webcam",
      validGeometry(face(), 1280, 960),
      [0.2, 0.8]
    )
    expect(small).not.toBeNull()
    expect(large).not.toBeNull()
    small!.forEach((value, index) =>
      expect(value).toBeCloseTo(large![index], 10)
    )
  })

  test("uses every frame's pose even at the same pretrained gaze point", () => {
    const neutral = buildRgbFeatures("webcam", validGeometry(), [0.2, 0.8])!
    const turned = buildRgbFeatures(
      "webcam",
      validGeometry(face(0.3)),
      [0.2, 0.8]
    )!
    expect(turned).not.toEqual(neutral)
    expect(turned[6]).toBeCloseTo(0.3)
    expect(turned.length).toBeLessThanOrEqual(24)
    expect(turned.every(Number.isFinite)).toBe(true)
  })

  test("phone and laptop geometries have distinct pose interactions", () => {
    const geometry = validGeometry(face(0.3))
    const mobile = buildRgbFeatures("mobile", geometry, [0.2, 0.8])!
    const webcam = buildRgbFeatures("webcam", geometry, [0.2, 0.8])!
    expect(mobile).not.toEqual(webcam)
    expect(mobile.length).toBeLessThanOrEqual(24)
    expect(mobile.every(Number.isFinite)).toBe(true)
    const shifted = structuredClone(geometry)
    shifted.pose.x = 0.55
    shifted.pose.scale *= 0.9
    expect(buildRgbFeatures("mobile", shifted, [0.2, 0.8])).not.toEqual(mobile)
  })

  test("rejects lost or multiple faces instead of reusing a past result", () => {
    const missing = face()
    missing.faceLandmarks = []
    expect(inspectRgbFace(missing, 640, 480).valid).toBe(false)
    const multiple = face()
    multiple.faceLandmarks.push(multiple.faceLandmarks[0])
    expect(inspectRgbFace(multiple, 640, 480)).toMatchObject({
      valid: false,
      reason: "multiple-faces",
    })
  })

  test("rejects closed eyelids and blink blendshapes", () => {
    const closed = face()
    for (const index of [158, 160, 144, 153])
      closed.faceLandmarks[0][index].y = 0.42
    expect(inspectRgbFace(closed, 640, 480)).toMatchObject({
      valid: false,
      reason: "blink",
    })
    const blink = face()
    blink.faceBlendshapes = [
      { categories: [{ categoryName: "eyeBlinkLeft", score: 0.9 }] },
    ]
    expect(inspectRgbFace(blink, 640, 480)).toMatchObject({
      valid: false,
      reason: "blink",
    })
  })

  test("rejects eyes too small to feed the appearance model", () => {
    expect(inspectRgbFace(face(), 80, 60)).toMatchObject({
      valid: false,
      reason: "eyes-too-small",
    })
  })

  test("rejects nonfinite landmarks, out-of-frame eyes, and unavailable pose", () => {
    const invalid = face()
    invalid.faceLandmarks[0][468].x = NaN
    expect(inspectRgbFace(invalid, 640, 480).valid).toBe(false)
    const clipped = face()
    clipped.faceLandmarks[0][473].x = 1.01
    expect(inspectRgbFace(clipped, 640, 480).valid).toBe(false)
    const noPose = face()
    noPose.facialTransformationMatrixes = []
    expect(inspectRgbFace(noPose, 640, 480)).toMatchObject({
      valid: false,
      reason: "pose-unavailable",
    })
  })

  test("rejects an unavailable or nonfinite appearance output", () => {
    expect(buildRgbFeatures("mobile", validGeometry(), null)).toBeNull()
    expect(
      buildRgbFeatures("webcam", validGeometry(), [Infinity, 0.5])
    ).toBeNull()
  })

  test("converts centered pretrained coordinates without clamping", () => {
    const unclamped = modelPredictionToScreen([-0.8, 0.7])!
    expect(unclamped[0]).toBeCloseTo(-0.3)
    expect(unclamped[1]).toBeCloseTo(1.2)
    expect(modelPredictionToScreen([NaN, 0])).toBeNull()
    expect(modelPredictionToScreen([0])).toBeNull()
  })

  test("preserves the pretrained legacy rotation convention separately from reported pose", () => {
    const geometry = validGeometry(face(0.3))
    const original = prepareBlazeGazeGeometry(geometry, 640, 480)
    const changedReportedPose = structuredClone(geometry)
    changedReportedPose.pose.yaw = 0.7
    changedReportedPose.pose.pitch = 0.2
    expect(
      prepareBlazeGazeGeometry(changedReportedPose, 640, 480).headVector
    ).toEqual(original.headVector)
  })

  test("constructs finite model-compatible head direction and nonzero face origin", () => {
    const geometry = validGeometry(face(0.3))
    const model = prepareBlazeGazeGeometry(geometry, 640, 480)
    expect(model.headVector[0]).toBeCloseTo(-Math.sin(0.3))
    expect(model.headVector[1]).toBeCloseTo(0)
    expect(model.headVector[2]).toBeCloseTo(-Math.cos(0.3))
    expect(model.faceOrigin.every(Number.isFinite)).toBe(true)
    expect(model.faceOrigin[2]).toBeGreaterThan(0)
    expect(model.faceWidthCm).toBeCloseTo(38.4) // Floor to pixels, matching model preprocessing.
  })
})

describe("BlazeGaze eye strip", () => {
  test("retains the upstream padded face warp and 151-to-195 eye band", () => {
    const frame = {
      width: 640,
      height: 480,
      data: new Uint8ClampedArray(640 * 480 * 4),
    }
    for (let y = 0; y < 480; y++)
      for (let x = 0; x < 640; x++) {
        const index = (y * 640 + x) * 4
        frame.data[index] = x % 256
        frame.data[index + 1] = y % 256
        frame.data[index + 2] = 42
        frame.data[index + 3] = 255
      }
    const patch = extractRgbEyePatch(frame, validGeometry().landmarks)
    expect(patch.width).toBe(512)
    expect(patch.height).toBe(128)
    // Floor-to-pixel padding gives (122.6,96); mapped eye-band top rounds to 142.
    expect(patch.data[0]).toBe(122)
    expect(patch.data[1]).toBe(167)
    expect(patch.data[2]).toBe(42)
    expect(patch.data[3]).toBe(255)
    expect(patch.data[(64 * 512 + 256) * 4 + 1]).toBeGreaterThan(patch.data[1])
  })

  test("rejects a degenerate crop rather than passing empty images to the model", () => {
    const geometry = validGeometry()
    geometry.landmarks[195] = geometry.landmarks[151]
    expect(() =>
      extractRgbEyePatch(
        { width: 640, height: 480, data: new Uint8ClampedArray(640 * 480 * 4) },
        geometry.landmarks
      )
    ).toThrow()
  })
})
