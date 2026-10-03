import { Button } from "@workspace/ui/components/button"
import { FileVideo, RotateCw } from "lucide-react"
import type { SourceControlsProps } from "./source-controls.types"

export function SourceControls({ session, state }: SourceControlsProps) {
  const busy = state.status === "loading" || state.status === "analysing"
  return (
    <section
      aria-label="Conversation source"
      className="space-y-4 rounded-xl border bg-card p-5"
    >
      <div className="flex items-center gap-2">
        <FileVideo size={18} aria-hidden="true" />
        <h2 className="font-semibold">Video</h2>
      </div>
      <Button
        className="w-full"
        disabled={busy}
        onClick={() => {
          void session.loadReference()
        }}
      >
        Use debate reference
      </Button>
      <label className="block space-y-2 text-sm">
        <span>Or choose a local video</span>
        <input
          type="file"
          aria-label="Upload a conversation video"
          accept=".mp4,.mov,.webm,.mkv,.avi"
          disabled={busy}
          className="block w-full rounded-md border p-2 text-xs file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-2"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              void session.loadFile(file)
            }
            event.target.value = ""
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Up to 120 seconds and 120 MiB. Audio stays on your computer.
      </p>
      <div className="border-t pt-3 text-xs">
        <div className="flex items-center justify-between">
          <span>
            {state.health?.ready
              ? "Local service ready"
              : "Local service unavailable"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void session.connect()
            }}
            aria-label="Reconnect to local speaker service"
          >
            <RotateCw size={14} />
          </Button>
        </div>
        {state.health?.device && (
          <p className="text-muted-foreground">
            {state.health.engine} · {state.health.device}
          </p>
        )}
        {state.serviceError && (
          <p role="status" className="mt-2 text-amber-200">
            {state.serviceError}
          </p>
        )}
        {!state.health?.ready && (
          <p className="mt-2 text-muted-foreground">
            Start <code>bun run dev:speaker-focus</code> from the frontend, then
            reconnect.
          </p>
        )}
      </div>
    </section>
  )
}
