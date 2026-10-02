import type { ApiKeyRecord, SessionData } from "@/lib/auth.types"

export type DashboardPageProps = {
  session: SessionData
  busy: boolean
  loadingKeys: boolean
  apiKeys: ApiKeyRecord[]
  newKeyName: string
  createdApiKey: string
  message: string
  error: string
  onSignOut: () => void
  onNewKeyNameChange: (value: string) => void
  onCreateKey: () => void
  onCopyCreatedKey: () => void
  onRegenerateKey: (key: ApiKeyRecord) => void
  onDeleteKey: (key: ApiKeyRecord) => void
}
