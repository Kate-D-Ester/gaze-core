import { ApiKeysPanel } from "@/components/dashboard/api-keys-panel"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import type { ApiKeyRecord, SessionData } from "@/types/auth"

type DashboardPageProps = {
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

export function DashboardPage({
  session,
  busy,
  loadingKeys,
  apiKeys,
  newKeyName,
  createdApiKey,
  message,
  error,
  onSignOut,
  onNewKeyNameChange,
  onCreateKey,
  onCopyCreatedKey,
  onRegenerateKey,
  onDeleteKey,
}: DashboardPageProps) {
  return (
    <main className="min-h-svh bg-gradient-to-b from-background to-muted/40 p-6">
      <section className="mx-auto max-w-4xl space-y-6">
        <DashboardHeader session={session} busy={busy} onSignOut={onSignOut} />

        <ApiKeysPanel
          loadingKeys={loadingKeys}
          busy={busy}
          apiKeys={apiKeys}
          newKeyName={newKeyName}
          createdApiKey={createdApiKey}
          onNewKeyNameChange={onNewKeyNameChange}
          onCreateKey={onCreateKey}
          onCopyCreatedKey={onCopyCreatedKey}
          onRegenerateKey={onRegenerateKey}
          onDeleteKey={onDeleteKey}
        />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
      </section>
    </main>
  )
}
