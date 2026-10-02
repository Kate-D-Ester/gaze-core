import { createCameraRelayHandler } from "../src/features/eye-tracking/camera-relay-server"

const configuredOrigins = process.env.GAZE_CAMERA_RELAY_ALLOWED_ORIGINS?.split(
  ","
)
  .map((origin) => origin.trim())
  .filter(Boolean)

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.GAZE_CAMERA_RELAY_PORT ?? 4022),
  fetch: createCameraRelayHandler({
    ...(configuredOrigins?.length ? { allowedOrigins: configuredOrigins } : {}),
  }),
})

console.log(`Camera relay listening at ${server.url}`)
