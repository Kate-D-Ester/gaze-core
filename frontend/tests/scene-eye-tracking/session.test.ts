import { expect, test } from "bun:test"
import {
  createSessionLog,
  appendMeasurement,
  exportSessionCsv,
  exportSessionJson,
} from "../../apps/web/src/features/scene-eye-tracking/session"
import type { GazeMeasurement } from "../../apps/web/src/features/scene-eye-tracking/scene.types"
export const measurement = (
  timestamp: number,
  valid = true
): GazeMeasurement => ({
  timestamp,
  eyeId: timestamp,
  sceneId: timestamp,
  eyeTimestamp: timestamp - 5,
  sceneTimestamp: timestamp - 3,
  confidence: 0.9,
  position: valid ? [0.25, 0.75] : null,
  pixels: valid ? [160, 360] : null,
  valid,
  reason: valid ? "" : "Fresh pupil evidence unavailable",
  extrapolated: false,
})
test("JSON and CSV preserve the recording origin, coordinates, invalid intervals and reasons", () => {
  const s = createSessionLog(1000, {
    sceneWidth: 640,
    sceneHeight: 480,
    delayMs: 80,
  })
  appendMeasurement(s, measurement(1100))
  appendMeasurement(s, measurement(1200, false))
  const csv = exportSessionCsv(s)
  expect(csv).toContain("session_ms")
  expect(csv).toContain("100,1100")
  expect(csv).toContain("0.25,0.75,160,360")
  expect(csv).toContain("Fresh pupil evidence unavailable")
  const json = JSON.parse(exportSessionJson(s))
  expect(json.startedAt).toBe(1000)
  expect(json.metadata.delayMs).toBe(80)
  expect(json.measurements[1].position).toBeNull()
  expect(json.coordinates).toContain("camera-image")
})
test("logs ignore pre-start samples, repeated frame pairs and remain bounded", () => {
  const s = createSessionLog(1000, {})
  appendMeasurement(s, measurement(900))
  appendMeasurement(s, measurement(1100))
  appendMeasurement(s, { ...measurement(1150), eyeId: 1100, sceneId: 1100 })
  expect(s.measurements).toHaveLength(1)
  for (let i = 0; i < 19000; i++) appendMeasurement(s, measurement(1200 + i))
  expect(s.measurements.length).toBeLessThanOrEqual(18000)
  expect(s.truncated).toBe(true)
})

test("CSV identifies unverified preview coordinates without marking them valid or estimated", () => {
  const session = createSessionLog(1000, { accuracy: "unverified" })
  appendMeasurement(session, {
    ...measurement(1100),
    valid: false,
    estimated: false,
    preview: true,
    reason: "Accuracy check required",
  })
  const [header, row] = exportSessionCsv(session).trim().split("\n")
  const fields = header.split(",")
  const values = row.split(",")
  expect(fields).toContain("preview")
  expect(values[fields.indexOf("preview")]).toBe("1")
  expect(values[fields.indexOf("valid")]).toBe("0")
  expect(values[fields.indexOf("estimated")]).toBe("0")
  expect(values[fields.indexOf("normalized_x")]).toBe("0.25")
})
