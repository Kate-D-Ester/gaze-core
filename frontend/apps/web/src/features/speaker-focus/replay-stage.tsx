import { useEffect, useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { boxAtTime, imagePoint } from "./selection"
import type { ImagePoint } from "./selection.types"
import type { SelectionBubble } from "./bubble-selection.types"
import type { ReplayStageProps } from "./replay-stage.types"
export function ReplayStage({ controller, state }: ReplayStageProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const [marking, setMarking] = useState(false)
  const [anchor, setAnchor] = useState<ImagePoint | null>(null)
  const [pointerBubble, setPointerBubble] = useState<SelectionBubble | null>(
    null
  )
  const displayedSample = state.displayedSample
  const time = (displayedSample ?? state.sourceSample) / 16000
  const visible = state.tracks.flatMap((track) => {
    const box = displayedSample === null ? null : boxAtTime(track, time)
    return box ? [{ track, box }] : []
  })
  function mouseBubble(clientPoint: ImagePoint): SelectionBubble | null {
    if (
      !canvas.current ||
      !state.media ||
      marking ||
      displayedSample === null
    ) {
      return null
    }
    const bounds = canvas.current.getBoundingClientRect()
    const point = imagePoint(
      clientPoint,
      bounds,
      state.media.width,
      state.media.height
    )
    if (!point) {
      return null
    }
    const radiusPx = Math.min(32, bounds.width / 2, bounds.height / 2)
    return {
      center: point,
      radius: [radiusPx / bounds.width, radiusPx / bounds.height],
      timestamp: time,
    }
  }
  useEffect(() => {
    const timer = setInterval(() => {
      if (canvas.current) {
        void controller.draw(canvas.current)
      }
    }, 40)
    return () => clearInterval(timer)
  }, [controller])
  return (
    <section aria-label="Streaming reference video" className="space-y-3">
      <div
        ref={surface}
        className="relative cursor-pointer overflow-hidden rounded-xl border bg-black"
        onPointerMove={(event) => {
          setPointerBubble(mouseBubble([event.clientX, event.clientY]))
        }}
        onPointerLeave={() => setPointerBubble(null)}
        onPointerDown={(event) => {
          if (event.button !== 0 || marking) {
            return
          }
          const bubble = mouseBubble([event.clientX, event.clientY])
          if (bubble && displayedSample !== null) {
            setPointerBubble(bubble)
            void controller.select(bubble.center, {
              sourceSample: displayedSample,
              radius: bubble.radius,
            })
          }
        }}
        style={{
          aspectRatio: state.media
            ? `${state.media.width}/${state.media.height}`
            : "16/9",
        }}
      >
        <canvas
          ref={canvas}
          className="block h-full w-full"
          tabIndex={state.media ? 0 : -1}
          aria-label="Current reference video"
          onKeyDown={(event) => {
            if (event.code === "Space" && state.media) {
              event.preventDefault()
              void (state.status === "playing"
                ? controller.pause()
                : controller.play())
            }
          }}
        />
        {!state.media && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            {state.status === "loading"
              ? "Loading video…"
              : "Choose a video to begin"}
          </div>
        )}
        {!marking &&
          visible.map(({ track, box }) => (
            <button
              key={track.id}
              aria-label={`Select face at ${Math.round((box[0] + box[2] / 2) * 100)}%, ${Math.round((box[1] + box[3] / 2) * 100)}%`}
              aria-pressed={state.selectedId === track.id}
              className={`absolute rounded-lg border-2 ${state.selectedId === track.id ? "border-primary bg-primary/10" : "border-white/50 hover:bg-white/10"}`}
              style={{
                left: `${box[0] * 100}%`,
                top: `${box[1] * 100}%`,
                width: `${box[2] * 100}%`,
                height: `${box[3] * 100}%`,
              }}
              onClick={(event) => {
                // Pointer selection happens on the stable video surface at press time.
                if (event.detail === 0 && displayedSample !== null) {
                  void controller.select(
                    [box[0] + box[2] / 2, box[1] + box[3] / 2],
                    { sourceSample: displayedSample }
                  )
                }
              }}
            >
              {state.selectedId === track.id && (
                <span className="absolute -top-7 left-0 rounded bg-black/80 px-2 py-1 text-xs">
                  Locked
                </span>
              )}
            </button>
          ))}
        {pointerBubble && !marking && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full border border-primary/70 bg-primary/5"
            style={{
              left: `${pointerBubble.center[0] * 100}%`,
              top: `${pointerBubble.center[1] * 100}%`,
              width: `${pointerBubble.radius[0] * 200}%`,
              height: `${pointerBubble.radius[1] * 200}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        )}
        {marking && (
          <div
            className="absolute inset-0 cursor-crosshair touch-none"
            role="application"
            aria-label="Draw reference face correction"
            onPointerDown={(event) => {
              if (!state.media || !surface.current) {
                return
              }
              setAnchor(
                imagePoint(
                  [event.clientX, event.clientY],
                  surface.current.getBoundingClientRect(),
                  state.media.width,
                  state.media.height
                )
              )
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerUp={(event) => {
              if (anchor && state.media && surface.current) {
                const end = imagePoint(
                  [event.clientX, event.clientY],
                  surface.current.getBoundingClientRect(),
                  state.media.width,
                  state.media.height
                )
                if (end) {
                  void controller.correct([
                    Math.min(anchor[0], end[0]),
                    Math.min(anchor[1], end[1]),
                    Math.abs(end[0] - anchor[0]),
                    Math.abs(end[1] - anchor[1]),
                  ])
                }
              }
              setAnchor(null)
              setMarking(false)
            }}
            onPointerCancel={() => {
              setAnchor(null)
              setMarking(false)
            }}
          />
        )}
      </div>
      {state.media && (
        <div className="flex items-center gap-3">
          <span className="w-10 text-xs text-muted-foreground tabular-nums">
            {time.toFixed(1)} s
          </span>
          <input
            className="min-w-0 flex-1 accent-primary"
            type="range"
            min={0}
            max={state.media.sampleCount}
            step={1600}
            value={state.sourceSample}
            aria-label="Reference playback position"
            onChange={(event) => {
              void controller.seek(Number(event.target.value))
            }}
          />
          <span className="text-xs text-muted-foreground tabular-nums">
            {state.media.duration.toFixed(1)} s
          </span>
        </div>
      )}
      {state.media && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {state.serviceError
              ? "Reconnect to detect faces"
              : "Click a face to listen"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={Boolean(state.serviceError)}
            onClick={() => setMarking(!marking)}
          >
            {marking ? "Cancel region" : "Correct face region"}
          </Button>
        </div>
      )}
    </section>
  )
}
