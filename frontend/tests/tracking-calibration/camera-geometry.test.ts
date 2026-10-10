import { expect, test } from "bun:test"
import { cameraGeometryIdentity } from "../../apps/web/src/features/tracking-calibration/camera-geometry"

test("same camera geometry survives a reconnect epoch but not device or resolution changes", () => {
  const dimensions = { width: 640, height: 480 }
  const source = {
    kind: "network" as const,
    name: "Eye camera",
    url: "http://esp32.local/stream",
    key: "epoch:1",
  }
  const before = cameraGeometryIdentity(source, dimensions)
  expect(
    cameraGeometryIdentity({ ...source, key: "epoch:2" }, dimensions)
  ).toBe(before)
  expect(
    cameraGeometryIdentity(
      { ...source, url: "http://second.local/stream" },
      dimensions
    )
  ).not.toBe(before)
  expect(cameraGeometryIdentity(source, { width: 800, height: 600 })).not.toBe(
    before
  )
  expect(cameraGeometryIdentity(null, dimensions)).toBeNull()
})
