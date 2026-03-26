import { Button } from "@workspace/ui/components/button"
import type { ApiKeyRecord } from "@/types/auth"

type ApiKeysPanelProps = {
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

function getApiKeyLabel(key: ApiKeyRecord) {
  if (key.name && key.name.trim().length > 0) {
    return key.name
  }

  if (key.start && key.start.trim().length > 0) {
    return key.start
  }

  return key.id
}

export function ApiKeysPanel({
  loadingKeys,
  busy,
  apiKeys,
  newKeyName,
  createdApiKey,
  onNewKeyNameChange,
  onCreateKey,
  onCopyCreatedKey,
  onRegenerateKey,
  onDeleteKey,
}: ApiKeysPanelProps) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold">API Keys</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Generate per-user keys for GazeCore services. Rate limits are configured server-side.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={newKeyName}
          onChange={(event) => onNewKeyNameChange(event.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="API key name"
        />
        <Button disabled={busy} onClick={onCreateKey}>
          Create API Key
        </Button>
      </div>

      {createdApiKey ? (
        <div className="mt-3 rounded-md border bg-muted/60 p-3">
          <p className="text-xs text-muted-foreground">New API Key</p>
          <p className="mt-1 break-all font-mono text-sm">{createdApiKey}</p>
          <Button className="mt-3" variant="outline" disabled={busy} onClick={onCopyCreatedKey}>
            Copy Key
          </Button>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {loadingKeys ? (
          <p className="text-sm text-muted-foreground">Loading keys...</p>
        ) : apiKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          apiKeys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div>
                <p className="text-sm font-medium">{getApiKeyLabel(key)}</p>
                <p className="text-xs text-muted-foreground">
                  {key.enabled === false ? "Disabled" : "Enabled"}
                </p>
                {key.start ? (
                  <p className="text-xs text-muted-foreground">Starts with {key.start}****</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs text-muted-foreground">
                  {key.prefix || "gaze_"}
                </p>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => onDeleteKey(key)}
                >
                  Delete
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => onRegenerateKey(key)}
                >
                  Regenerate
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
