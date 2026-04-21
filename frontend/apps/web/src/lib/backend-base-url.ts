const DEFAULT_BACKEND_BASE_URL = "http://localhost:4000"

function normalizeBaseUrl(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return DEFAULT_BACKEND_BASE_URL
  return trimmed.replace(/\/+$/g, "") || DEFAULT_BACKEND_BASE_URL
}

export function getBackendBaseUrl() {
  return normalizeBaseUrl(import.meta.env.VITE_GAZECORE_BACKEND_URL)
}

export function getAuthBaseUrl() {
  return `${getBackendBaseUrl()}/api/auth`
}
