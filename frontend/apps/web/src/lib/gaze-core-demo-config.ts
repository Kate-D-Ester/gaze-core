import { getBackendBaseUrl } from "@/lib/backend-base-url"

export function getGazeCoreDemoConfig() {
  return {
    backendBaseUrl: getBackendBaseUrl(),
  }
}
