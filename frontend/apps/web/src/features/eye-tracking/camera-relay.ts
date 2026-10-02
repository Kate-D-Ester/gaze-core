export const CAMERA_RELAY_ORIGIN = "http://127.0.0.1:4022"
export function cameraRelayStreamUrl(cameraUrl: URL): string {
  const relayUrl = new URL("/stream", CAMERA_RELAY_ORIGIN)
  relayUrl.searchParams.set("url", cameraUrl.href)
  return relayUrl.href
}
