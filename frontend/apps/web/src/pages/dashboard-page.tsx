import { ApiKeysPanel } from "@/components/dashboard/api-keys-panel"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { TrackingTrials } from "@/components/dashboard/tracking-trials"
import type { DashboardPageProps } from "./dashboard-page.types"

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
    <main className="min-h-svh bg-background p-4 sm:p-6">
      <section className="mx-auto max-w-5xl space-y-6">
        <DashboardHeader session={session} busy={busy} onSignOut={onSignOut} />

        <TrackingTrials />

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
