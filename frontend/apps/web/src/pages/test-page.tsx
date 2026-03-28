import { useEffect, useRef, useState, type FormEvent } from "react"
import { GazeCoreWidget } from "@workspace/ui/components/gaze-core-widget"
import { getGazeCoreDemoConfig } from "@/lib/gaze-core-demo-config"
import { issueDemoGazeSession, type GazeCoreDemoSession } from "@/lib/gaze-core-demo-session"

async function requestDemoSession(input: {
  backendBaseUrl: string
  apiKey: string
  email: string
}) {
  return issueDemoGazeSession(input)
}

export function TestPage() {
  const initialConfig = getGazeCoreDemoConfig()
  const [backendBaseUrl, setBackendBaseUrl] = useState(initialConfig.backendBaseUrl)
  const [email, setEmail] = useState(initialConfig.email ?? "")
  const [apiKey, setApiKey] = useState(initialConfig.apiKey ?? "")
  const [session, setSession] = useState<GazeCoreDemoSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const didAutoIssueRef = useRef(false)

  async function handleIssueSession(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setBusy(true)
    setError("")

    try {
      const nextSession = await requestDemoSession({
        backendBaseUrl,
        apiKey,
        email,
      })
      setSession(nextSession)
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : "Unable to issue a demo session.")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (didAutoIssueRef.current) return
    if (!backendBaseUrl || !apiKey || !email) return

    didAutoIssueRef.current = true
    void requestDemoSession({
      backendBaseUrl,
      apiKey,
      email,
    }).then((nextSession) => {
      setSession(nextSession)
    }).catch((issueError) => {
      setError(issueError instanceof Error ? issueError.message : "Unable to issue a demo session.")
    })
  }, [backendBaseUrl, apiKey, email])

  const widgetConfig = session
    ? {
        backendBaseUrl,
        apiKey,
        deviceUuid: session.uuid,
        livePreviewSocketUrl: session.websocketUrl,
        livePreviewToken: session.token,
      }
    : {
        backendBaseUrl,
        apiKey,
        deviceUuid: initialConfig.deviceUuid,
        livePreviewSocketUrl: initialConfig.livePreviewSocketUrl,
        livePreviewToken: initialConfig.livePreviewToken,
      }

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-card/70 px-6 py-5 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">GazeCore Test</h1>
            <p className="text-sm text-muted-foreground">
              Enter an email and API key to derive a stable UUID, issue a demo token, and boot the widget with that session.
            </p>
          </div>

          <form className="grid gap-3 lg:grid-cols-[1.1fr_1.1fr_1.3fr_auto]" onSubmit={(event) => void handleIssueSession(event)}>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Backend URL</span>
              <input
                value={backendBaseUrl}
                onChange={(event) => setBackendBaseUrl(event.target.value)}
                placeholder="http://localhost:3000"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="person@example.com"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">API Key</span>
              <input
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste API key here"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy || !backendBaseUrl.trim() || !email.trim() || !apiKey.trim()}
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Issuing..." : session ? "Reissue Session" : "Issue Session"}
              </button>
            </div>
          </form>

          {error && (
            <p className="rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {session && (
            <div className="grid gap-2 rounded-md border bg-background p-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-foreground/70">Email</div>
                <div className="font-medium text-foreground">{session.email}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-foreground/70">UUID</div>
                <div className="font-mono text-foreground">{session.uuid}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-foreground/70">Expires</div>
                <div className="text-foreground">{new Date(session.expiresAt).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-foreground/70">WebSocket</div>
                <div className="font-mono text-foreground break-all">{session.websocketUrl ?? "auto-resolved from backend URL"}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      <GazeCoreWidget {...widgetConfig} />
    </main>
  )
}
