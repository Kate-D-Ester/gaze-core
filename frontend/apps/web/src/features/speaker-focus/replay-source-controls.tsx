import { Button } from "@workspace/ui/components/button"
import type { ReplaySourceControlsProps } from "./replay-source-controls.types"
export function ReplaySourceControls({
  controller,
  state,
}: ReplaySourceControlsProps) {
  const busy = state.status === "loading"
  return (
    <section
      aria-label="Conversation source"
      className="flex flex-wrap items-center gap-3"
    >
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => {
          void controller.loadReference()
        }}
      >
        {busy ? "Loading video…" : "Use debate reference"}
      </Button>
      <label className="relative inline-flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-sm">
        Choose video
        <input
          type="file"
          accept="video/*,.mp4,.mov,.webm,.mkv,.avi"
          aria-label="Upload a conversation video"
          disabled={busy}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              void controller.loadFile(file)
            }
            event.target.value = ""
          }}
        />
      </label>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {state.label}
      </span>
      <button
        className="min-h-9 text-xs text-muted-foreground"
        aria-label="Reconnect to local speaker service"
        onClick={() => {
          void controller.connect()
        }}
      >
        {state.health?.live && !state.serviceError
          ? "Local service ready"
          : "Reconnect"}
      </button>
      {state.serviceError && (
        <p role="status" className="w-full text-xs text-amber-200">
          {state.serviceError}
        </p>
      )}
    </section>
  )
}
