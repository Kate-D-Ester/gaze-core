import { expect, test } from "bun:test"
import { createApp } from "./app"

const app = createApp()

test("auth session and health endpoints remain available", async () => {
  const healthResponse = await app.handle(
    new Request("http://localhost/health")
  )
  const health = await healthResponse.json()

  expect(healthResponse.status).toBe(200)
  expect(health.status).toBe("healthy")

  const authResponse = await app.handle(
    new Request("http://localhost/api/auth/get-session")
  )
  expect(authResponse.status).not.toBe(404)
})

test("legacy eye-tracking and profile endpoints are not registered", async () => {
  const legacyResponses = await Promise.all([
    app.handle(
      new Request("http://localhost/api/gaze/test/validate/uuid", {
        method: "POST",
      })
    ),
    app.handle(new Request("http://localhost/api/camera/mjpeg")),
    app.handle(new Request("http://localhost/api/users/me")),
  ])

  expect(legacyResponses.map((response) => response.status)).toEqual([
    404,
    404,
    404,
  ])
})
