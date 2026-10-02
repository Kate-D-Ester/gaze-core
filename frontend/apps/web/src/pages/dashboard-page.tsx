import { ApiKeysPanel } from "@/components/dashboard/api-keys-panel"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Button } from "@workspace/ui/components/button"
import { useNavigate } from "react-router-dom"
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
  const navigate = useNavigate()

  return (
    <main className="min-h-svh bg-gradient-to-b from-background to-muted/40 p-6">
      <section className="mx-auto max-w-4xl space-y-6">
        <DashboardHeader session={session} busy={busy} onSignOut={onSignOut} />

        <section className="rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Eye tracking
              </h2>
              <p className="text-sm text-muted-foreground">
                Try the browser-based eye-tracking experience.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate("/trial/screen-eye-tracking")}>Try it out</Button>
            </div>
          </div>
        </section>

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
