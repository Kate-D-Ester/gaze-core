import { createAuthClient } from "better-auth/client"
import { getAuthBaseUrl } from "@/lib/backend-base-url"

function getApiBaseUrl() {
  return getAuthBaseUrl()
}

export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  fetchOptions: {
    credentials: "include",
  },
})
