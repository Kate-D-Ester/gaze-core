type GazeCoreRuntimeConfig = {
  backendBaseUrl?: string
}

declare global {
  interface Window {
    __GAZECORE_CONFIG__?: GazeCoreRuntimeConfig
  }
}

const DEFAULT_BACKEND_BASE_URL = "http://localhost:4000"

function getRuntimeBackendBaseUrl() {
  if (typeof window === "undefined") return undefined
  return window.__GAZECORE_CONFIG__?.backendBaseUrl
}

function normalizeBaseUrl(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return DEFAULT_BACKEND_BASE_URL
  return trimmed.replace(/\/+$/g, "") || DEFAULT_BACKEND_BASE_URL
}

export function getBackendBaseUrl() {
  return normalizeBaseUrl(getRuntimeBackendBaseUrl() ?? import.meta.env.VITE_GAZECORE_BACKEND_URL)
}

export function getAuthBaseUrl() {
  return `${getBackendBaseUrl()}/api/auth`
}
