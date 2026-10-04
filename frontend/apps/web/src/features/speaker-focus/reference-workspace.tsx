import { ArrowLeft } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { TrackingBrand } from "../tracking-ui/tracking-brand"
import { EyeAppStyles } from "../tracking-ui/layout-styles"
import { useSpeakerReplay } from "./use-speaker-replay"
import { ReplayStage } from "./replay-stage"
import { ReplaySourceControls } from "./replay-source-controls"
import { streamingStatus } from "./status"
import type { ReferenceWorkspaceProps } from "./reference-workspace.types"

export function ReferenceWorkspace({
  onSetup,
  onExport,
}: ReferenceWorkspaceProps) {
  const { controller, state } = useSpeakerReplay()
  let playLabel = "Play"
  if (state.status === "playing") {
    playLabel = "Pause"
  } else if (state.status === "draining" || state.status === "ended") {
    playLabel = "Replay"
  }
  return (
    <div className={`${EyeAppStyles} [height:auto] min-h-svh overflow-auto`}>
      <header className="flex min-h-16 items-center justify-between gap-4 border-b px-5 md:px-8">
        <TrackingBrand version="speaker focus" />
        <button
          onClick={onSetup}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft size={16} />
          Back to setup
        </button>
      </header>
      <main className="mx-auto w-full max-w-5xl space-y-5 px-5 py-6 md:px-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">
            Reference test
          </h1>
          <Button variant="ghost" size="sm" onClick={onExport}>
            File export
          </Button>
        </div>
        <ReplaySourceControls controller={controller} state={state} />
        <ReplayStage controller={controller} state={state} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm">
            {streamingStatus(state)}
          </p>
          <div className="flex gap-2" aria-label="Listening mode">
            <Button
              size="sm"
              variant={state.mode === "original" ? "default" : "outline"}
              aria-label="Listen to original audio"
              aria-pressed={state.mode === "original"}
              onClick={() => {
                void controller.listen("original")
              }}
            >
              Original
            </Button>
            <Button
              size="sm"
              variant={state.mode === "focused" ? "default" : "outline"}
              aria-label="Listen to focused audio"
              aria-pressed={state.mode === "focused"}
              onClick={() => {
                void controller.listen("focused")
              }}
            >
              Focused
            </Button>
            <Button
              size="sm"
              disabled={!state.media || state.status === "loading"}
              aria-label={
                state.status === "playing"
                  ? "Pause reference playback"
                  : "Play reference playback"
              }
              onClick={() => {
                void (state.status === "playing"
                  ? controller.pause()
                  : controller.play())
              }}
            >
              {playLabel}
            </Button>
          </div>
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-amber-200">
            {state.error}
          </p>
        )}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer py-2">Details</summary>
          <div className="space-y-2 py-2">
            <p>
              Incremental local separation and noise suppression. Delay adapts
              to your computer; other voices and artifacts can remain.
            </p>
            <p>
              The picture stays live. Focused audio plays as soon as processing
              finishes; its delay depends on your computer.
            </p>
            <p>
              Up to 120 seconds and 120 MiB. Video decoding depends on browser
              codec support.
            </p>
          </div>
        </details>
      </main>
    </div>
  )
}
