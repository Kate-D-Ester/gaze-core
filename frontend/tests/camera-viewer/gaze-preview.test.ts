import { expect, test } from "bun:test"
import { getViewerGaze } from "../../apps/web/src/features/camera-viewer/viewer-gaze"
import { calibrate } from "../scene-eye-tracking/fixtures"
import { liveSnapshot } from "./fixtures"

function fixture() {
  const { s, id, time: previousTime } = calibrate()
  const time = previousTime + 50
  const camera = liveSnapshot()
  camera.frame = { ...camera.frame!, id: id + 1, timestamp: time }
  s.addEye(
    {
      id: id + 1,
      timestamp: time,
      feature: [0.1, -0.1],
      confidence: 0.95,
      valid: true,
    },
    time
  )
  s.measure(camera.frame, time)
  return { session: s, camera, time }
}

test("viewer shows calibrated scene gaze from the existing session", () => {
  const { session, camera, time } = fixture()
  const display = getViewerGaze(session.getSnapshot(), camera, time)
  expect(display.point?.[0]).toBeCloseTo(0.6, 4)
  expect(display.point?.[1]).toBeCloseTo(0.4, 4)
  expect(display.verified).toBe(true)
})

test("viewer hides gaze when evidence is stale, camera disconnected, or calibration invalidated", () => {
  const { session, camera, time } = fixture()
  expect(
    getViewerGaze(session.getSnapshot(), camera, time + 251).point
  ).toBeNull()
  expect(
    getViewerGaze(
      session.getSnapshot(),
      { ...camera, connection: "idle" },
      time
    ).point
  ).toBeNull()
  session.invalidate()
  expect(getViewerGaze(session.getSnapshot(), camera, time).point).toBeNull()
})

test("unverified calibration previews are not presented as usable gaze", () => {
  const { session, camera, time } = fixture()
  const state = session.getSnapshot()
  expect(
    getViewerGaze({ ...state, validation: null }, camera, time).point
  ).toBeNull()
  expect(
    getViewerGaze(
      { ...state, reusedCalibration: true, validation: null },
      camera,
      time
    ).verified
  ).toBe(false)
})
