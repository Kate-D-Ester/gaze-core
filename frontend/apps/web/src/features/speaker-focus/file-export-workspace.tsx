import { ArrowLeft, Headphones } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { buttonVariants } from "@workspace/ui/components/button-variants"
import { TrackingBrand } from "../tracking-ui/tracking-brand"
import { EyeAppStyles } from "../tracking-ui/layout-styles"
import { useSpeakerFocus } from "./use-speaker-focus"
import { SourceControls } from "./source-controls"
import { VideoStage } from "./video-stage"
import { listeningStatus } from "./status"

import type { FileExportWorkspaceProps } from "./file-export-workspace.types"

export function FileExportWorkspace({ onReference }: FileExportWorkspaceProps) {
  const { session, state } = useSpeakerFocus()
  const done = state.job?.status === "done" && !state.selection.paused
  const progress = Math.round((state.job?.progress ?? 0) * 100)
  return (
    <div className={`${EyeAppStyles} [height:auto] min-h-svh overflow-auto`}>
      <header className="flex min-h-16 items-center justify-between gap-4 border-b px-5 md:px-8">
        <TrackingBrand version="speaker focus" />
        <button
          onClick={onReference}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft size={16} />
          Back to reference
        </button>
      </header>
      <main className="mx-auto w-full max-w-6xl space-y-7 px-5 py-7 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              File export
            </h1>
          </div>
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            <VideoStage session={session} state={state} />
            <section
              aria-label="Listening mode"
              className="space-y-4 rounded-xl border bg-card p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Headphones size={18} />
                  Listen
                </h2>
                <div className="flex gap-2">
                  <Button
                    variant={state.mode === "original" ? "default" : "outline"}
                    aria-label="Listen to original audio"
                    aria-pressed={state.mode === "original"}
                    onClick={() => {
                      void session.listen("original")
                    }}
                  >
                    Original audio
                  </Button>
                  <Button
                    variant={state.mode === "focused" ? "default" : "outline"}
                    aria-label="Listen to focused audio"
                    aria-pressed={state.mode === "focused"}
                    disabled={!done}
                    onClick={() => {
                      void session.listen("focused")
                    }}
                  >
                    Focused audio
                  </Button>
                </div>
              </div>
              <p role="status" className="text-sm">
                {listeningStatus(state, done, progress)}
              </p>
              {state.status === "processing" && (
                <>
                  <progress
                    className="h-2 w-full accent-primary"
                    value={progress}
                    max={100}
                    aria-label="Voice extraction progress"
                  />
                  <Button variant="outline" size="sm" onClick={session.stop}>
                    Cancel extraction
                  </Button>
                </>
              )}
              {state.error && (
                <p role="alert" className="text-sm text-amber-200">
                  {state.error}
                </p>
              )}
              {done && state.job?.audio_url && state.job.preview_url && (
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <a
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                    href={`http://127.0.0.1:4033${state.job.audio_url}`}
                    download
                  >
                    Download focused WAV
                  </a>
                  <a
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                    href={`http://127.0.0.1:4033${state.job.preview_url}`}
                    download
                  >
                    Download video preview
                  </a>
                  <span className="text-muted-foreground">
                    {state.job.elapsed_seconds?.toFixed(1)} s extraction · no
                    live buffering
                  </span>
                </div>
              )}
            </section>
          </div>
          <aside className="space-y-4">
            <SourceControls session={session} state={state} />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer py-2">Details</summary>
              <p>
                Experimental separation. Other voices and artifacts can remain.
              </p>
              <p>
                Each voice is processed once; repeat selections use its cached
                output.
              </p>
            </details>
          </aside>
        </div>
      </main>
    </div>
  )
}
