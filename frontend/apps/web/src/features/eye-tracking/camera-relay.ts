const DEFAULT_CAMERA_RELAY_PORT = 4022

export function cameraRelayStreamUrl(cameraUrl: URL): string {
  const configuredPort = process.env.NEXT_PUBLIC_GAZE_CAMERA_RELAY_PORT
  const port = Number(configuredPort ?? DEFAULT_CAMERA_RELAY_PORT)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Invalid local camera relay port")
  }
  const relayUrl = new URL(`/stream`, `http://127.0.0.1:${port}`)
  relayUrl.searchParams.set("url", cameraUrl.href)
  return relayUrl.href
}
