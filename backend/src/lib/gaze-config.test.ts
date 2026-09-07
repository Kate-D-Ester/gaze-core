import { expect, test } from "bun:test"
import { buildWebSocketUrlFromRequest } from "./gaze-config"

test("buildWebSocketUrlFromRequest uses the public HTTPS proxy origin", () => {
  const request = new Request("http://backend:4000/api/gaze/test/validate/uuid", {
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "api.example.com",
    },
  })

  expect(buildWebSocketUrlFromRequest(request)).toBe(
    "wss://api.example.com/api/gaze/screen/ws",
  )
})
