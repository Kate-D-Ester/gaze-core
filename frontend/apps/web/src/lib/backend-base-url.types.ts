export type GazeCoreRuntimeConfig = {
  backendBaseUrl?: string
}

declare global {
  interface Window {
    __GAZECORE_CONFIG__?: GazeCoreRuntimeConfig
  }
}
