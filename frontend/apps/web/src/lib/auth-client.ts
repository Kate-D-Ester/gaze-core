import { getAuthBaseUrl } from "@/lib/backend-base-url"
import { createAuthClient } from "better-auth/client"
function getApiBaseUrl() {
  return getAuthBaseUrl()
}
export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  fetchOptions: {
    credentials: "include",
  },
})
