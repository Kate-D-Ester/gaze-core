import { expect, test } from "bun:test"
import { buildLivePreviewSocketUrl } from "./routes"

test("buildLivePreviewSocketUrl targets the live screen websocket route", () => {
  expect(buildLivePreviewSocketUrl("http://localhost:4000")).toBe(
    "ws://localhost:4000/api/gaze/screen/ws",
  )
})
