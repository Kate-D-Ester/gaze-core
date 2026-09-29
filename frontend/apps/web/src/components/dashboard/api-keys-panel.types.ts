import type { ApiKeyRecord } from "@/lib/auth.types"

export type ApiKeysPanelProps = {
  loadingKeys: boolean
  busy: boolean
  apiKeys: ApiKeyRecord[]
  newKeyName: string
  createdApiKey: string
  onNewKeyNameChange: (value: string) => void
  onCreateKey: () => void
  onCopyCreatedKey: () => void
  onRegenerateKey: (key: ApiKeyRecord) => void
  onDeleteKey: (key: ApiKeyRecord) => void
}
