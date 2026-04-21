const DEFAULT_BACKEND_BASE_URL = "http://localhost:4000"

export function normalizeBackendBaseUrl(baseUrl?: string) {
  const normalized = (baseUrl?.trim() || DEFAULT_BACKEND_BASE_URL).replace(/\/+$/g, "")
  return normalized || DEFAULT_BACKEND_BASE_URL
}

function buildRouteUrl(baseUrl: string | undefined, routePath: string) {
  const normalizedBaseUrl = normalizeBackendBaseUrl(baseUrl)
  const url = new URL(routePath, `${normalizedBaseUrl}/`)
  return url.toString()
}

export function buildTokenRouteUrl(baseUrl?: string) {
  return buildRouteUrl(baseUrl, "/api/gaze/token")
}

export function buildSessionTokenRouteUrl(baseUrl?: string) {
  return buildRouteUrl(baseUrl, "/api/gaze/test/validate/uuid")
}

export function buildGyroSnapshotRouteUrl(baseUrl?: string) {
  return buildRouteUrl(baseUrl, "/api/gaze/gyro-snapshot")
}

export function buildLivePreviewSocketUrl(baseUrl?: string, overrideSocketUrl?: string) {
  if (overrideSocketUrl?.trim()) return overrideSocketUrl.trim()

  const url = new URL("/api/gaze/ws", `${normalizeBackendBaseUrl(baseUrl)}/`)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  return url.toString()
}
