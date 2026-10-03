import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Button } from "@workspace/ui/components/button"
import { LiveController } from "./live-controller"
import { boxAtTime, imagePoint } from "./selection"
import type { ImagePoint } from "./selection.types"
import type { SceneSpeakerPanelProps } from "./scene-panel.types"
export function LiveSpeakerPanel(props: SceneSpeakerPanelProps) {
  const [controller] = useState(() => new LiveController())
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot
  )
  const current = useRef<HTMLCanvasElement>(null)
  const delayed = useRef<HTMLCanvasElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const [verifiedIdentity, setVerifiedIdentity] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const syncIdentity = JSON.stringify([
    props.identity,
    props.frame?.generation,
    props.frame?.width,
    props.frame?.height,
    offset,
  ])
  const verified = verifiedIdentity === syncIdentity
  const [marking, setMarking] = useState(false)
  const [anchor, setAnchor] = useState<ImagePoint | null>(null)
  useEffect(() => {
    controller.mount()
    return () => controller.dispose()
  }, [controller])
  useEffect(() => {
    controller.setEvidence(props)
  }, [controller, props])
  useEffect(() => {
    const timer = setInterval(() => {
      if (current.current && props.camera.latest) {
        current.current.width = props.camera.rawCanvas.width
        current.current.height = props.camera.rawCanvas.height
        current.current
          .getContext("2d")
          ?.drawImage(props.camera.rawCanvas, 0, 0)
      }
      if (delayed.current) {
        controller.draw(delayed.current)
      }
    }, 50)
    return () => clearInterval(timer)
  }, [controller, props.camera])
  const busy = state.status === "starting" || state.status === "live"
  const time = (props.frame?.timestamp ?? 0) / 1000
  return (
    <section
      aria-label="Live speaker focus"
      className="mt-4 space-y-4 rounded-xl border p-4 text-sm"
    >
      <div>
        <h3 className="font-semibold">Live speaker focus</h3>
        <p className="text-xs text-muted-foreground">
          Camera plus a separate mixed-audio microphone. Only explicit Start
          requests microphone access.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs">Current scene · select a face</p>
          <div
            ref={surface}
            className="relative overflow-hidden rounded border bg-black"
            style={{
              aspectRatio: props.frame
                ? `${props.frame.width}/${props.frame.height}`
                : "4/3",
            }}
          >
            <canvas
              ref={current}
              className="block w-full"
              aria-label="Current scene for speaker selection"
            />
            {!marking &&
              state.tracks.map((track, index) => {
                const box = boxAtTime(track, time)
                if (!box) {
                  return null
                }
                return (
                  <button
                    key={track.id}
                    aria-label={`Select live speaker ${index + 1}`}
                    aria-pressed={state.selection.selectedId === track.id}
                    className={`absolute border-2 ${state.selection.selectedId === track.id ? "border-primary" : "border-white/70"}`}
                    style={{
                      left: `${box[0] * 100}%`,
                      top: `${box[1] * 100}%`,
                      width: `${box[2] * 100}%`,
                      height: `${box[3] * 100}%`,
                    }}
                    onClick={() =>
                      controller.select([
                        box[0] + box[2] / 2,
                        box[1] + box[3] / 2,
                      ])
                    }
                  >
                    <span className="bg-black/80 p-1 text-xs">{index + 1}</span>
                  </button>
                )
              })}
            {marking && (
              <div
                role="application"
                aria-label="Draw live face correction"
                className="absolute inset-0 cursor-crosshair touch-none"
                onPointerDown={(event) => {
                  const element = surface.current
                  if (!element || !props.frame) {
                    return
                  }
                  setAnchor(
                    imagePoint(
                      [event.clientX, event.clientY],
                      element.getBoundingClientRect(),
                      props.frame.width,
                      props.frame.height
                    )
                  )
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerUp={(event) => {
                  const element = surface.current
                  if (!element || !props.frame || !anchor) {
                    return
                  }
                  const point = imagePoint(
                    [event.clientX, event.clientY],
                    element.getBoundingClientRect(),
                    props.frame.width,
                    props.frame.height
                  )
                  if (point) {
                    const box = [
                      Math.min(anchor[0], point[0]),
                      Math.min(anchor[1], point[1]),
                      Math.abs(point[0] - anchor[0]),
                      Math.abs(point[1] - anchor[1]),
                    ] as const
                    if (box[2] > 0.02 && box[3] > 0.02) {
                      controller.correct(box)
                    }
                  }
                  setMarking(false)
                  setAnchor(null)
                }}
                onPointerCancel={() => {
                  setAnchor(null)
                  setMarking(false)
                }}
              />
            )}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs">Listening view · 4.0 s delayed</p>
          <canvas
            ref={delayed}
            className="aspect-video w-full rounded border bg-black"
            aria-label="Video synchronized with delayed live audio"
          />
        </div>
      </div>
      <p className="text-xs">
        {props.verified
          ? "Verified calibrated gaze: hold on one face for 0.5 s."
          : "Click a face. A current scene accuracy check is required for gaze selection."}
      </p>
      <div className="flex flex-wrap gap-2">
        {state.tracks.map((track, index) => {
          const box = boxAtTime(track, time)
          if (!box) {
            return null
          }
          return (
            <Button
              key={track.id}
              variant="outline"
              size="sm"
              onClick={() =>
                controller.select([box[0] + box[2] / 2, box[1] + box[3] / 2])
              }
            >
              Live speaker {index + 1}
            </Button>
          )
        })}
        <Button
          variant="outline"
          size="sm"
          disabled={state.status !== "live"}
          onClick={() => setMarking(!marking)}
        >
          {marking ? "Cancel region" : "Correct live face region"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={state.status !== "live"}
          onClick={() => controller.correct(null)}
        >
          Clear correction
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-xs">
          Video timing offset · ms
          <input
            aria-label="Live video synchronization offset (ms)"
            type="number"
            min={-500}
            max={500}
            step={10}
            value={offset}
            disabled={busy}
            className="ml-2 w-20 rounded border bg-background p-2"
            onChange={(event) => setOffset(Number(event.target.value))}
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={verified}
            disabled={busy}
            onChange={(event) =>
              setVerifiedIdentity(event.target.checked ? syncIdentity : null)
            }
          />
          I checked camera/microphone alignment
        </label>
        <Button
          disabled={busy || !props.source || !verified}
          onClick={() => {
            void controller.start(verified, offset)
          }}
        >
          {state.status === "starting" ? "Starting…" : "Start live microphone"}
        </Button>
        <Button
          variant="outline"
          disabled={!busy}
          onClick={() => controller.stop()}
        >
          Stop live
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Use a clap or visible speech to check alignment. Positive offset moves
        video later. Network arrival timestamps alone cannot verify capture
        timing; actual ESP32 clock validation is still required. Sessions stop
        after 120 seconds.
      </p>
      <div className="flex gap-2">
        <Button
          variant={state.mode === "original" ? "default" : "outline"}
          size="sm"
          onClick={() => controller.listen("original")}
        >
          Original microphone
        </Button>
        <Button
          variant={state.mode === "focused" ? "default" : "outline"}
          size="sm"
          onClick={() => controller.listen("focused")}
        >
          Focused live audio
        </Button>
      </div>
      <p role="status" className="text-xs">
        {state.status} · {state.device || "local service"} · 2 s context / 1 s
        stride · 4.0 s total playout delay
        {state.inferenceSeconds !== null
          ? ` · last inference ${state.inferenceSeconds.toFixed(2)} s · arrived after ${state.arrivalDelay?.toFixed(2)} s`
          : ""}
      </p>
      <p className="text-xs">
        {state.selection.reason}
        {state.mode === "focused" && !state.selection.selectedId
          ? " · focused audio is silent until a face is selected"
          : ""}
      </p>
      {state.error && (
        <p role="alert" className="text-xs text-amber-200">
          {state.error}
        </p>
      )}
    </section>
  )
}
