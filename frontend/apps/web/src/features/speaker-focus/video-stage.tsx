import { useEffect, useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { boxAtTime, imagePoint } from "./selection"
import type { ImagePoint } from "./selection.types"
import type { VideoStageProps, VisibleTarget } from "./video-stage.types"

export function VideoStage({ session, state }: VideoStageProps) {
  const host = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const [time, setTime] = useState(0)
  const [marking, setMarking] = useState(false)
  const [start, setStart] = useState<ImagePoint | null>(null)
  const [end, setEnd] = useState<ImagePoint | null>(null)
  useEffect(() => {
    const element = host.current
    if (!element) {
      return
    }
    element.append(session.video)
    const update = () => {
      setTime(session.video.currentTime)
    }
    session.video.addEventListener("timeupdate", update)
    return () => {
      session.video.removeEventListener("timeupdate", update)
      session.video.remove()
    }
  }, [session])
  const targets: VisibleTarget[] = []
  const tracks = state.clip?.tracks ?? []
  const ordered = [...tracks].sort(
    (a, b) =>
      (a.observations[0]?.box[0] ?? 0) - (b.observations[0]?.box[0] ?? 0)
  )
  for (const [index, track] of ordered.entries()) {
    const box = boxAtTime(track, time)
    if (box) {
      targets.push({ track, box, number: index + 1 })
    }
  }
  const region =
    start && end
      ? ([
          Math.min(start[0], end[0]),
          Math.min(start[1], end[1]),
          Math.abs(start[0] - end[0]),
          Math.abs(start[1] - end[1]),
        ] as const)
      : null
  return (
    <section aria-label="Video and visible speakers" className="space-y-3">
      <div
        ref={surface}
        className="relative aspect-video overflow-hidden rounded-xl border bg-black"
        style={{
          aspectRatio: state.clip?.media
            ? `${state.clip.media.width}/${state.clip.media.height}`
            : "16/9",
        }}
      >
        <div ref={host} className="absolute inset-0" />
        {!state.sourceUrl && (
          <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-muted-foreground">
            Choose the reference or upload a conversation to find visible
            speakers.
          </div>
        )}
        {!marking &&
          targets.map(({ track, box, number }) => (
            <button
              key={track.id}
              aria-label={`Focus speaker ${number}`}
              aria-pressed={state.selection.selectedId === track.id}
              className={`absolute rounded border-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 ${state.selection.selectedId === track.id ? "border-primary bg-primary/10" : "border-white/50 hover:border-primary"}`}
              style={{
                left: `${box[0] * 100}%`,
                top: `${box[1] * 100}%`,
                width: `${box[2] * 100}%`,
                height: `${box[3] * 100}%`,
              }}
              onClick={() => {
                void session.selectPoint([
                  box[0] + box[2] / 2,
                  box[1] + box[3] / 2,
                ])
              }}
            >
              <span className="absolute -top-7 rounded bg-black/80 px-2 py-1 text-xs">
                {number}
                {track.manual ? " · corrected" : ""}
              </span>
            </button>
          ))}
        {marking && (
          <div
            className="absolute inset-0 cursor-crosshair touch-none"
            role="application"
            aria-label="Drag a region around one face"
            onPointerDown={(event) => {
              const element = surface.current
              const media = state.clip?.media
              if (!element || !media) {
                return
              }
              const point = imagePoint(
                [event.clientX, event.clientY],
                element.getBoundingClientRect(),
                media.width,
                media.height
              )
              if (point) {
                event.currentTarget.setPointerCapture(event.pointerId)
                setStart(point)
                setEnd(point)
              }
            }}
            onPointerMove={(event) => {
              const element = surface.current
              const media = state.clip?.media
              if (!start || !element || !media) {
                return
              }
              const point = imagePoint(
                [event.clientX, event.clientY],
                element.getBoundingClientRect(),
                media.width,
                media.height
              )
              if (point) {
                setEnd(point)
              }
            }}
            onPointerUp={() => {
              if (region && region[2] > 0.02 && region[3] > 0.02) {
                void session.region([...region])
              }
              setMarking(false)
              setStart(null)
              setEnd(null)
            }}
            onPointerCancel={() => {
              setStart(null)
              setEnd(null)
              setMarking(false)
            }}
          >
            {region && (
              <div
                className="absolute border-2 border-primary bg-primary/10"
                style={{
                  left: `${region[0] * 100}%`,
                  top: `${region[1] * 100}%`,
                  width: `${region[2] * 100}%`,
                  height: `${region[3] * 100}%`,
                }}
              />
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{state.filename || "No source loaded"}</span>
        <span>{time.toFixed(1)} s · source clock</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {targets.map(({ track, box, number }) => (
          <Button
            key={track.id}
            variant={
              state.selection.selectedId === track.id ? "default" : "outline"
            }
            size="sm"
            onClick={() => {
              void session.selectPoint([
                box[0] + box[2] / 2,
                box[1] + box[3] / 2,
              ])
            }}
          >
            Speaker {number}
            {track.manual ? " · corrected" : ""}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          disabled={!state.clip || state.status === "analysing"}
          aria-pressed={marking}
          onClick={() => {
            session.video.pause()
            setMarking(!marking)
          }}
        >
          {marking ? "Cancel correction" : "Correct a face region"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {marking
          ? "Drag around exactly one face. This correction replaces automatic tracks in that area."
          : "Click a face or use a speaker button. Correct its region if low-quality video interrupts tracking."}
      </p>
    </section>
  )
}
