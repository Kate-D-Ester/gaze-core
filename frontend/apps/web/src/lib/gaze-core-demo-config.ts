const DEFAULT_BACKEND_BASE_URL = "http://localhost:3000"

function readEnv(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function getGazeCoreDemoConfig() {
  return {
    backendBaseUrl: readEnv(import.meta.env.VITE_GAZECORE_BACKEND_URL) ?? DEFAULT_BACKEND_BASE_URL,
    apiKey: readEnv(import.meta.env.VITE_GAZECORE_API_KEY),
    deviceUuid: readEnv(import.meta.env.VITE_GAZECORE_DEVICE_UUID),
    email: readEnv(import.meta.env.VITE_GAZECORE_TEST_EMAIL),
    livePreviewSocketUrl: readEnv(import.meta.env.VITE_GAZECORE_LIVE_PREVIEW_WS_URL),
    livePreviewToken: readEnv(import.meta.env.VITE_GAZECORE_LIVE_PREVIEW_TOKEN),
  }
}
