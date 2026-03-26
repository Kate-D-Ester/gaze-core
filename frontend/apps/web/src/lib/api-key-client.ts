import type { ApiKeyRecord } from "@/types/auth"

type ApiKeysListResponse = {
  apiKeys?: ApiKeyRecord[]
}

type CreateApiKeyResponse = {
  key?: string
}

type DeleteApiKeyResponse = {
  success?: boolean
}

const authApiUrl = import.meta.env.VITE_AUTH_BASE_URL || "http://localhost:3000/api/auth"

export async function listApiKeys() {
  const response = await fetch(`${authApiUrl}/api-key/list`, {
    method: "GET",
    credentials: "include",
  })

  if (response.status === 404) {
    return []
  }

  if (!response.ok) {
    throw new Error("Unable to load API keys")
  }

  const data = (await response.json()) as ApiKeysListResponse
  return data.apiKeys ?? []
}

export async function createApiKey(name: string) {
  const response = await fetch(`${authApiUrl}/api-key/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      name,
      metadata: {
        services: ["screen_tracking"],
        tier: "dev",
      },
    }),
  })

  if (!response.ok) {
    throw new Error("Unable to create API key")
  }

  const data = (await response.json()) as CreateApiKeyResponse
  return data.key ?? ""
}

export async function deleteApiKey(keyId: string) {
  const response = await fetch(`${authApiUrl}/api-key/delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ keyId }),
  })

  if (!response.ok) {
    throw new Error("Unable to delete API key")
  }

  const data = (await response.json()) as DeleteApiKeyResponse
  return data.success === true
}