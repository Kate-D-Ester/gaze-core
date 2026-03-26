import { createAuthClient } from "better-auth/client"

function getApiBaseUrl() {
  return import.meta.env.VITE_AUTH_BASE_URL || "http://localhost:3000/api/auth"
}

export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  fetchOptions: {
    credentials: "include",
  },
})
