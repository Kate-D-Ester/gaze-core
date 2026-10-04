import type { GazeBubbleOverlaySnapshot } from "../gaze-bubble/gaze-bubble-overlay.types"
import { visibleSelectionBubble } from "./bubble-selection"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { Button } from "@workspace/ui/components/button"
import { GazeBubbleOverlay } from "../gaze-bubble/gaze-bubble-overlay"
import { LiveController } from "./live-controller"
import { boxAtTime, imagePoint, verifiedGazePoint } from "./selection"
import type { ImagePoint } from "./selection.types"
import type { SceneSpeakerPanelProps } from "./scene-panel.types"

export function LiveSpeakerPanel(props: SceneSpeakerPanelProps) {
  const [controller] = useState(() => new LiveController())
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot
  )
  const evidence = useRef(props)
  useLayoutEffect(() => {
    evidence.current = props
  }, [props])
  const current = useRef<HTMLCanvasElement>(null)
  const currentPreview = useRef<HTMLCanvasElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const [verifiedIdentity, setVerifiedIdentity] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [clock, setNow] = useState(0)
  // New source samples may arrive between timer ticks. Their own timestamps
  // keep rendering current; the overlay/controller verify real age in effects.
  const now = Math.max(
    clock,
    props.frame?.timestamp ?? 0,
    props.measurement?.timestamp ?? 0
  )
  const [marking, setMarking] = useState(false)
  const [anchor, setAnchor] = useState<ImagePoint | null>(null)
  const active = props.active !== false
  const syncIdentity = JSON.stringify([
    props.identity,
    props.frame?.generation,
    props.frame?.width,
    props.frame?.height,
    offset,
  ])
  const verified = verifiedIdentity === syncIdentity
  const busy =
    state.status === "starting" ||
    state.status === "live" ||
    state.status === "draining"
  const arrivalOnly = props.source?.kind === "network"
  const time = (props.frame?.timestamp ?? 0) / 1000
  const frameFresh =
    !!props.frame &&
    now >= props.frame.timestamp &&
    now - props.frame.timestamp <= 150
  const point =
    props.verified && frameFresh
      ? verifiedGazePoint(props.measurement, now)
      : null
  const selected = state.tracks.findIndex(
    (track) => track.id === state.selection.selectedId
  )
  let status = "Check camera/microphone alignment below, then start listening."
  if (verified) {
    status = "Start listening, then look at or click a face."
  }
  if (busy) {
    status = "Look at a face for 0.5 s, or click to select."
    if (!props.verified) {
      status = "Click a face. Check gaze accuracy to use gaze selection."
    }
    if (selected >= 0) {
      status = `Speaker ${selected + 1} locked · ${state.timing?.state === "playing" ? "Listening" : "Buffering"}`
      if (
        state.timing?.delaySeconds !== null &&
        state.timing?.delaySeconds !== undefined
      ) {
        status += ` · ${state.timing.delaySeconds.toFixed(1)} s delay`
      }
    }
    if (state.selection.paused) {
      status = "Face lost · select it again"
    }
  }
  useEffect(() => {
    controller.mount()
    return () => controller.dispose()
  }, [controller])
  const handleBubbleSnapshot = useCallback(
    (snapshot: GazeBubbleOverlaySnapshot | null) => {
      const measurement = evidence.current.measurement
      const bubble = visibleSelectionBubble(
        snapshot,
        measurement,
        evidence.current.verified,
        performance.now()
      )
      controller.setDisplayedGaze(
        measurement && bubble ? { measurement, bubble } : null
      )
    },
    [controller]
  )
  useEffect(() => {
    controller.setEvidence(props)
  }, [controller, props])
  useEffect(() => {
    if (!active) {
      controller.stop()
    }
  }, [active, controller])
  useEffect(() => {
    if (!active) {
      return
    }
    const timer = setInterval(() => {
      setNow(performance.now())
      const canvas = current.current
      if (canvas && props.camera.latest) {
        const source = props.camera.rawCanvas
        if (canvas.width !== source.width || canvas.height !== source.height) {
          canvas.width = source.width
          canvas.height = source.height
        }
        canvas.getContext("2d")?.drawImage(source, 0, 0)
      }
      if (currentPreview.current) {
        controller.draw(currentPreview.current)
      }
    }, 50)
    return () => clearInterval(timer)
  }, [active, controller, props.camera])
  return (
    <section aria-label="Live speaker focus" className="space-y-4 py-4 text-sm">
      {!props.guided && <h3 className="font-semibold">Speaker focus</h3>}
      <div
        ref={surface}
        className="relative overflow-hidden rounded-xl border bg-black"
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
        {!props.frame && (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            Connect a scene camera
          </div>
        )}
        {!marking &&
          state.tracks.map((track, index) => {
            const box = boxAtTime(track, time)
            if (!box || !frameFresh) {
              return null
            }
            const locked =
              state.selection.selectedId === track.id && !state.selection.paused
            return (
              <button
                key={track.id}
                aria-label={`Select live speaker ${index + 1}`}
                aria-pressed={locked}
                className={`absolute rounded border-2 ${locked ? "border-primary bg-primary/10" : "border-white/60"}`}
                style={{
                  left: `${box[0] * 100}%`,
                  top: `${box[1] * 100}%`,
                  width: `${box[2] * 100}%`,
                  height: `${box[3] * 100}%`,
                }}
                onClick={() =>
                  controller.select([box[0] + box[2] / 2, box[1] + box[3] / 2])
                }
              >
                <span className="absolute -top-6 left-0 rounded bg-black/80 px-2 py-1 text-xs">
                  {index + 1}
                  {locked && " · locked"}
                </span>
              </button>
            )
          })}
        {props.frame && (
          <GazeBubbleOverlay
            point={point}
            timestamp={props.measurement?.timestamp ?? null}
            verified={props.verified}
            resetKey={props.identity}
            fixed={false}
            stabilize={false}
            animate={false}
            imageSize={props.frame}
            maxAgeMs={150}
            errorRadiusPx={props.errorRadiusPx ?? null}
            onSnapshot={handleBubbleSnapshot}
          />
        )}
        {marking && (
          <div
            role="application"
            aria-label="Draw live face correction"
            className="absolute inset-0 z-10 cursor-crosshair touch-none"
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
              const end = imagePoint(
                [event.clientX, event.clientY],
                element.getBoundingClientRect(),
                props.frame.width,
                props.frame.height
              )
              if (end) {
                const box = [
                  Math.min(anchor[0], end[0]),
                  Math.min(anchor[1], end[1]),
                  Math.abs(end[0] - anchor[0]),
                  Math.abs(end[1] - anchor[1]),
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs">
          {status}
        </p>
        <div className="flex flex-wrap gap-2">
          {busy ? (
            <>
              <Button
                size="sm"
                aria-pressed={state.mode === "original"}
                variant={state.mode === "original" ? "default" : "outline"}
                onClick={() => controller.listen("original")}
              >
                Original
              </Button>
              <Button
                size="sm"
                aria-pressed={state.mode === "focused"}
                variant={state.mode === "focused" ? "default" : "outline"}
                onClick={() => controller.listen("focused")}
              >
                Focused
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => controller.stop()}
              >
                Stop
              </Button>
            </>
          ) : (
            <Button
              aria-label="Start live microphone"
              disabled={!active || !props.source || !verified || arrivalOnly}
              onClick={() => {
                void controller.start(verified, offset)
              }}
            >
              {state.status === "paused"
                ? "Resume listening"
                : "Start listening"}
            </Button>
          )}
        </div>
      </div>
      {state.error && (
        <p role="alert" className="text-xs text-amber-200">
          {state.error}
        </p>
      )}
      {arrivalOnly && (
        <p role="alert" className="text-xs text-amber-200">
          This network camera has no capture timestamps. Use a USB scene camera
          or test a synchronized video for focused audio.
        </p>
      )}
      <details className="space-y-3 text-xs" open={!verified && !busy}>
        <summary className="cursor-pointer py-2">
          Camera &amp; microphone alignment
        </summary>
        <p>Clap once and check the picture matches the sound.</p>
        <label className="block">
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
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={verified}
            disabled={busy || arrivalOnly}
            onChange={(event) =>
              setVerifiedIdentity(event.target.checked ? syncIdentity : null)
            }
          />
          I checked camera/microphone alignment
        </label>
      </details>
      {busy && (
        <details className="space-y-3 text-xs">
          <summary className="cursor-pointer py-2">
            Listening preview &amp; tracking
          </summary>
          <p>
            The picture stays current while focused audio is processed. Select
            faces in the scene above.
          </p>
          <canvas
            ref={currentPreview}
            className="aspect-video w-full rounded border bg-black"
            aria-label="Current scene video"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMarking(!marking)}
            >
              {marking ? "Cancel region" : "Correct face region"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => controller.correct(null)}
            >
              Clear correction
            </Button>
          </div>
          <p>
            {state.device} · last extraction{" "}
            {state.inferenceSeconds?.toFixed(2) ?? "—"} s
          </p>
        </details>
      )}
    </section>
  )
}
