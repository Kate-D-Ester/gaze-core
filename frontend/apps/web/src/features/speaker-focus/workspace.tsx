import Link from "next/link"
import { ArrowLeft, Headphones } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { buttonVariants } from "@workspace/ui/components/button-variants"
import { TrackingBrand } from "../tracking-ui/tracking-brand"
import { EyeAppStyles } from "../tracking-ui/layout-styles"
import { useSpeakerFocus } from "./use-speaker-focus"
import { SourceControls } from "./source-controls"
import { VideoStage } from "./video-stage"
import { StandaloneLive } from "./standalone-live"
import { listeningStatus } from "./status"

export function SpeakerFocusWorkspace() {
  const { session, state } = useSpeakerFocus()
  const done = state.job?.status === "done" && !state.selection.paused
  const progress = Math.round((state.job?.progress ?? 0) * 100)
  return (
    <div className={`${EyeAppStyles} [height:auto] min-h-svh overflow-auto`}>
      <header className="flex min-h-16 items-center justify-between gap-4 border-b px-5 md:px-8">
        <TrackingBrand version="speaker focus" />
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft size={16} />
          Dashboard
        </Link>
      </header>
      <main className="mx-auto w-full max-w-6xl space-y-7 px-5 py-7 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Speaker focus
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a visible person and compare their extracted voice with the
              conversation.
            </p>
          </div>
          <span className="rounded-md border px-3 py-1 text-xs">
            Processed clip
          </span>
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
                    disabled={!state.selection.selectedId}
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
            <div className="rounded-xl border p-5 text-xs text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">
                Experimental separation
              </p>
              <p>
                Other voices and artifacts can remain. This reference simulates
                low resolution and compression; real ESP32 optics and infrared
                behavior need camera testing.
              </p>
              <p className="mt-3">
                For calibrated gaze selection, open the scene camera trial’s
                live stage.
              </p>
              <Link
                href="/trial/scene-camera-eye-tracking"
                className="mt-3 inline-flex min-h-11 items-center text-primary"
              >
                Open scene gaze →
              </Link>
            </div>
          </aside>
        </div>
        <StandaloneLive />
      </main>
    </div>
  )
}
