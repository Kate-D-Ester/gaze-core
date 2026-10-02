import { createCameraRelayHandler } from "../src/features/eye-tracking/camera-relay-server"

export function startCameraRelay(
  port = Number(process.env.GAZE_CAMERA_RELAY_PORT ?? 4022)
) {
  const configuredOrigins =
    process.env.GAZE_CAMERA_RELAY_ALLOWED_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: createCameraRelayHandler({
      ...(configuredOrigins?.length
        ? { allowedOrigins: configuredOrigins }
        : {}),
    }),
  })

  console.log(`Camera relay listening at ${server.url}`)
  return server
}

export async function startOrReuseCameraRelay(
  port = Number(process.env.GAZE_CAMERA_RELAY_PORT ?? 4022)
) {
  try {
    return startCameraRelay(port)
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EADDRINUSE"
    ) {
      throw error
    }

    const origin = `http://127.0.0.1:${port}`
    try {
      const response = await fetch(`${origin}/health`, {
        signal: AbortSignal.timeout(1500),
      })
      const health: unknown = await response.json()
      if (
        response.ok &&
        typeof health === "object" &&
        health !== null &&
        "service" in health &&
        health.service === "camera-relay" &&
        "ok" in health &&
        health.ok === true
      ) {
        console.log(`Using the camera relay already running at ${origin}`)
        return null
      }
    } catch {
      // An occupied port is reusable only when it answers as our relay.
    }
    throw new Error(
      `Port ${port} is occupied, but no healthy camera relay is available.`,
      {
        cause: error,
      }
    )
  }
}

if (import.meta.main) {
  startCameraRelay()
}
