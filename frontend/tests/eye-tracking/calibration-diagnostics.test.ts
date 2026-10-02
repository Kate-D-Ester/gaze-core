import { expect, test } from "bun:test"
import { CalibrationDiagnostics } from "../../apps/web/src/features/eye-tracking/calibration-diagnostics"
import { readHeadPose } from "../../apps/web/src/features/eye-tracking/head-tracking/head-pose"
import type { TrackingFrame } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
import { fixtureCalibrationSamples } from "./head-motion-fixture"

function eyeFrame(id: number): TrackingFrame {
  return {
    id,
    timestamp: id * 40,
    width: 640,
    height: 480,
    gaze: { origin: [0, 0, 0], direction: [0.1, 0.2, -1], pupil: [0, 0, 0] },
    detection: {
      ellipse: {
        center: [100, 100],
        major: 20,
        minor: 15,
        angle: 0,
        confidence: 0.9,
      },
      previews: [
        {
          label: "Strict",
          threshold: 20,
          score: 0.9,
          mask: new Uint8Array(100000),
        },
      ],
    },
  } as TrackingFrame
}

test("retains the complete rejected head pass and its failure reason for replay", () => {
  const diagnostics = new CalibrationDiagnostics()
  const samples = fixtureCalibrationSamples()
  const attempt = diagnostics.startFit({
    samples,
    orientation: { horizontal: -1, vertical: 1 },
    screenAspectRatio: 1.6,
  })
  diagnostics.finishFit(attempt, {
    calibration: null,
    issue: {
      code: "head-validation",
      measuredError: 0.12,
      message: "Held-out error",
    },
  })
  samples[0].feature[0] = 12345
  const report = diagnostics.snapshot()
  expect(report.attempts[0].samples).toHaveLength(21)
  expect(report.attempts[0].samples[0].feature[0]).not.toBe(12345)
  expect(report.attempts[0].result?.issue?.code).toBe("head-validation")
})

test("keeps dropped pairs, original face transforms, and unclamped dot positions", () => {
  const diagnostics = new CalibrationDiagnostics()
  const pose = readHeadPose(
    [1.2, 0, 0, 0, 0, 1.2, 0, 0, 0, 0, 1.2, 0, 2, -3, -50, 1],
    2,
    70
  )!
  diagnostics.recordReading({
    mode: "calibration",
    now: 90,
    eye: eyeFrame(1),
    head: pose,
    pairedHead: null,
    point: null,
    status: "unpaired",
    target: [0.5, 0.5],
    phase: "fixation",
    instruction: "Face lost",
  })
  diagnostics.recordReading({
    mode: "live",
    now: 130,
    eye: eyeFrame(2),
    head: pose,
    pairedHead: { ...pose, timestamp: 80 },
    point: [-0.5, 1.2],
    status: "outside-screen",
  })
  const report = diagnostics.snapshot()
  expect(report.readings).toHaveLength(2)
  expect(report.readings[0].pairedHead).toBeNull()
  expect(report.readings[0].head?.measurement?.scale).toBeCloseTo(1.2)
  expect(report.readings[1].head?.timestamp).toBe(70)
  expect(report.readings[1].pairedHead?.timestamp).toBe(80)
  expect(report.readings[1].point).toEqual([-0.5, 1.2])
  expect(report.readings[0].eye?.feature).toEqual([0.1, 0.2])
})

test("does not export preview masks, source URLs, device IDs, or arbitrary properties", () => {
  const diagnostics = new CalibrationDiagnostics()
  const eye = {
    ...eyeFrame(1),
    url: "http://camera/?password=secret",
    deviceId: "private-device",
    token: "secret",
  }
  const pose = {
    id: 1,
    timestamp: 40,
    position: [0, 0, -50],
    rotation: [0, 0, 0],
    secret: "hidden",
  }
  diagnostics.recordReading({
    mode: "live",
    now: 50,
    eye,
    head: pose,
    pairedHead: pose,
    point: [0.5, 0.5],
    status: "tracking",
  } as Parameters<CalibrationDiagnostics["recordReading"]>[0])
  const serialized = JSON.stringify(diagnostics.snapshot())
  for (const excluded of [
    "mask",
    "previews",
    "password",
    "deviceId",
    "token",
    "private-device",
    "hidden",
  ]) {
    expect(serialized).not.toContain(excluded)
  }
  expect(serialized.length).toBeLessThan(3000)
})

test("bounds continuous recordings and removes repeated readings of the same exposure", () => {
  const diagnostics = new CalibrationDiagnostics()
  for (let id = 1; id <= 2000; id++) {
    for (let repeat = 0; repeat < 3; repeat++) {
      diagnostics.recordReading({
        mode: "live",
        now: id * 40 + repeat,
        eye: eyeFrame(id),
        head: null,
        pairedHead: null,
        point: [0.5, 0.5],
        status: "tracking",
      })
    }
  }
  const readings = diagnostics.snapshot().readings
  expect(readings).toHaveLength(1500)
  expect(readings[0].eye?.id).toBe(501)
  expect(readings.at(-1)?.eye?.id).toBe(2000)
})

test("keeps failure transitions when the camera exposure has not changed", () => {
  const diagnostics = new CalibrationDiagnostics()
  const reading = {
    mode: "live" as const,
    now: 100,
    eye: eyeFrame(1),
    head: null,
    pairedHead: null,
    point: null,
    status: "head-lost",
  }
  diagnostics.recordReading(reading)
  diagnostics.recordReading({ ...reading, now: 500, status: "eye-lost" })
  expect(diagnostics.snapshot().readings).toHaveLength(2)
})

test("keeps separate bounded attempts and ignores a late result after clearing", () => {
  const diagnostics = new CalibrationDiagnostics()
  const request = {
    samples: fixtureCalibrationSamples(),
    orientation: { horizontal: -1 as const, vertical: 1 as const },
    screenAspectRatio: 1.6,
  }
  for (let i = 0; i < 5; i++) diagnostics.startFit(request)
  expect(diagnostics.snapshot().attempts).toHaveLength(3)
  const attempt = diagnostics.startFit(request)
  diagnostics.clear()
  diagnostics.finishFit(attempt, { calibration: null, issue: null })
  expect(diagnostics.snapshot().attempts).toHaveLength(0)
  expect(diagnostics.snapshot().readings).toHaveLength(0)
})
