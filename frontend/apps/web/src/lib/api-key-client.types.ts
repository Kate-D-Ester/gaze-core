import type { ApiKeyRecord } from "./auth.types"

export type ApiKeysListResponse = {
  apiKeys?: ApiKeyRecord[]
}

export type CreateApiKeyResponse = {
  key?: string
}

export type DeleteApiKeyResponse = {
  success?: boolean
}
