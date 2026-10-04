import { freshSceneFrame, SceneSourceIdentity } from "./scene-frame"
import { AudioDevices } from "./audio-devices"
import { AudioDeviceControls } from "./audio-device-controls"
import { SceneFacePreview } from "./scene-face-preview"
import type { GazeBubbleOverlaySnapshot } from "../gaze-bubble/gaze-bubble-overlay.types"
import { visibleSelectionBubble } from "./bubble-selection"
import {
  useMemo,
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
  const [sceneIdentity] = useState(() => new SceneSourceIdentity())
  const [devices] = useState(() => new AudioDevices())
  const audioDevices = useSyncExternalStore(
    devices.subscribe,
    devices.getSnapshot
  )
  const preview = useMemo(
    () => new SceneFacePreview(props.camera),
    [props.camera]
  )
  const facePreview = useSyncExternalStore(
    preview.subscribe,
    preview.getSnapshot
  )
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
    sceneIdentity.observe(props.identity, props.frame, props.source?.key),
    offset,
    audioDevices.selection.microphoneId,
  ])
  const verified = verifiedIdentity === syncIdentity
  const busy =
    state.status === "starting" ||
    state.status === "live" ||
    state.status === "draining"
  const sourceKey = props.source?.key
  const drawing = marking && state.status === "live"
  const arrivalOnly = props.source?.kind === "network"
  const time = (props.frame?.timestamp ?? 0) / 1000
  const frameFresh = freshSceneFrame(props.frame, now)
  const gazeEnabled = props.verified || props.allowUnverifiedGaze === true
  const point =
    gazeEnabled && frameFresh
      ? verifiedGazePoint(props.measurement, now, props.allowUnverifiedGaze)
      : null
  const selected = state.tracks.findIndex(
    (track) => track.id === state.selection.selectedId
  )
  let status = "Check camera/microphone alignment below, then start listening."
  if (verified) {
    status = "Start listening, then look at or click a face."
  }
  if (selected >= 0 && !busy) {
    status = "Face locked · start listening when ready"
  }
  if (busy) {
    status = "Look at a face for 0.5 s, or click to select."
    if (!gazeEnabled) {
      status = "Click a face. Check gaze accuracy to use gaze selection."
    }
    if (selected >= 0) {
      status = `Face locked · ${state.timing?.state === "playing" ? "Listening" : "Buffering"}`
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
  if (busy && state.videoWaiting) {
    status = "Camera interrupted · listening will resume automatically"
    if (frameFresh) {
      status = "Waiting for the locked face · look at or click another face"
    }
  }
  if (state.status === "draining") {
    status = "Finishing buffered audio · stop to select another face"
  }
  useEffect(() => {
    void devices.mount()
    return () => devices.dispose()
  }, [devices])
  useEffect(() => {
    if (active && sourceKey) {
      preview.start()
    }
    return () => preview.dispose()
  }, [active, preview, sourceKey])
  useEffect(() => {
    controller.setPreviewTracks(active ? facePreview.tracks : [])
  }, [active, controller, facePreview.tracks])
  useEffect(() => {
    if (busy && (audioDevices.inputMissing || audioDevices.outputMissing)) {
      controller.stop(
        "The selected audio device disconnected. Reconnect it or choose another device."
      )
    }
  }, [audioDevices.inputMissing, audioDevices.outputMissing, busy, controller])
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
        performance.now(),
        evidence.current.allowUnverifiedGaze
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
      controller.correct(null)
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
        className="relative mx-auto overflow-hidden rounded-xl border bg-black"
        style={{
          width: `min(100%, calc(48vh * ${props.frame ? props.frame.width / props.frame.height : 4 / 3}))`,
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
            {props.source ? "Waiting for camera" : "Connect a scene camera"}
          </div>
        )}
        {!drawing &&
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
                disabled={state.status === "draining"}
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
                  {locked ? "Locked" : "Select face"}
                </span>
              </button>
            )
          })}
        {props.frame && (
          <GazeBubbleOverlay
            point={point}
            timestamp={props.measurement?.timestamp ?? null}
            verified={gazeEnabled}
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
        {drawing && (
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
                  preview.correct(box)
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
      {props.allowUnverifiedGaze && !props.verified && (
        <p role="status" className="text-xs text-muted-foreground">
          Accuracy not verified · using your current calibration.
        </p>
      )}
      <AudioDeviceControls
        devices={devices}
        snapshot={audioDevices}
        listening={busy}
        active={active}
        onOutput={(id) => controller.setOutputDevice(id)}
      />
      {facePreview.status === "loading" && (
        <p role="status" className="text-xs text-muted-foreground">
          Detecting faces…
        </p>
      )}
      {facePreview.error && (
        <div className="flex items-center gap-2 text-xs text-amber-200">
          <p role="alert">{facePreview.error}</p>
          <Button size="sm" variant="outline" onClick={() => preview.start()}>
            Retry face detection
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs">
          {status}
        </p>
        <div className="flex flex-wrap gap-2">
          {busy ? (
            <>
              <Button
                size="sm"
                disabled={state.status !== "live"}
                aria-pressed={state.mode === "original"}
                variant={state.mode === "original" ? "default" : "outline"}
                onClick={() => controller.listen("original")}
              >
                Original
              </Button>
              <Button
                size="sm"
                disabled={state.status !== "live"}
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
              disabled={
                !active ||
                !props.source ||
                props.connection === "error" ||
                !verified ||
                audioDevices.inputMissing ||
                audioDevices.outputMissing ||
                audioDevices.busy
              }
              onClick={() => {
                setMarking(false)
                setAnchor(null)
                void controller
                  .start(verified, offset, audioDevices.selection)
                  .then(() => devices.refresh())
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
        <p role="status" className="text-xs text-amber-200">
          Network camera timing is estimated. Check alignment below and adjust
          the offset if the picture arrives after the sound.
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
            disabled={busy}
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
              disabled={state.status !== "live"}
              onClick={() => setMarking(!marking)}
            >
              {marking ? "Cancel region" : "Correct face region"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={state.status !== "live"}
              onClick={() => {
                preview.correct(null)
                controller.correct(null)
              }}
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
