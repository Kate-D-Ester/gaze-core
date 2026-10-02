// Browser-only smoke fixture; synthetic sensors never touch the production route.
import { createRoot } from "react-dom/client"
import { useCallback, useEffect, useRef, useState } from "react"
import { SceneWorkspace } from "../src/features/scene-eye-tracking/scene-workspace"
import {
  CALIBRATION_TARGETS,
  VALIDATION_TARGETS,
} from "../src/features/scene-eye-tracking/calibration"
import type { TrackerController } from "../src/features/eye-tracking/use-tracker.types"
import type { TrackingFrame } from "../src/features/eye-tracking/eye-tracking.types"
import "../src/pages/v2.css"
import { replayHandClip } from "./hand-replay"
import { markerSvg } from "../src/features/scene-eye-tracking/marker-detector"
declare const SCENE_MARKER_WORKER_URL: string
import { CameraTransformControls } from "../src/features/eye-tracking/components/camera-transform-controls"
import { DEFAULT_CAMERA_TRANSFORM } from "../src/features/eye-tracking/camera-transform"
const points = [...CALIBRATION_TARGETS, ...VALIDATION_TARGETS]
let target = points[0],
  lost = false,
  missingHand = false,
  missingGaze = false,
  intermittentLoss = false,
  recoveryBursts = false,
  cornerNoise = false,
  perspectiveMapping = false,
  badTopLeft = false,
  handSpikes = false,
  validationBias = false,
  badValidationPoint = false,
  printedMarker = false,
  difficultMarker = false,
  previewCopy = false,
  sequence = 0
const raw = document.createElement("canvas")
raw.width = 960
raw.height = 540
const context = raw.getContext("2d")!
const eyeCanvas = document.createElement("canvas")
eyeCanvas.width = 640
eyeCanvas.height = 480
const eyeContext = eyeCanvas.getContext("2d")!
const markerImage = new Image()
markerImage.src = "data:image/svg+xml," + encodeURIComponent(markerSvg())
function draw() {
  context.fillStyle = "#182523"
  context.fillRect(0, 0, raw.width, raw.height)
  context.fillStyle = "#c9e8db"
  context.font = "24px sans-serif"
  context.fillText("SYNTHETIC SCENE · no physical cameras", 30, 36)
  context.fillStyle = "#ffa867"
  context.beginPath()
  context.arc(target[0] * 960, target[1] * 540, 12, 0, Math.PI * 2)
  context.fill()
  if (previewCopy) {
    const preview = document.querySelector<HTMLCanvasElement>(
      'canvas[aria-label="Scene camera preview with calibration marker and mapped gaze"]'
    )
    if (preview?.width && preview.height)
      context.drawImage(preview, 600, 325, 350, 197)
  }
  if (printedMarker && markerImage.complete) {
    context.save()
    if (difficultMarker) {
      context.filter = "blur(1.5px) contrast(0.45) brightness(0.7)"
    }
    context.drawImage(
      markerImage,
      target[0] * 960 - 55,
      target[1] * 540 - 55,
      110,
      110
    )
    context.restore()
  }
  requestAnimationFrame(draw)
}
draw()
Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
  configurable: true,
  value: async () => raw.captureStream(30),
})
Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
  configurable: true,
  value: async () => [],
})
const NativeWorker = window.Worker
let markerEvidence = "Not started"
class FixtureWorker {
  constructor(url?: string | URL) {
    if (String(url).includes("marker.worker")) {
      const worker = new NativeWorker(SCENE_MARKER_WORKER_URL, {
        type: "module",
      })
      worker.addEventListener("message", ({ data }) => {
        if (data.type === "result")
          markerEvidence = data.marker.position
            ? data.marker.position
                .map((value: number) => value.toFixed(3))
                .join(", ")
            : data.marker.reason
      })
      return worker as unknown as FixtureWorker
    }
  }
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror = null
  onmessageerror = null
  closed = false
  postMessage(message: {
    type: string
    generation: number
    bitmap?: ImageBitmap
    scene?: object
  }) {
    if (this.closed) return
    if (message.type === "init")
      queueMicrotask(() =>
        this.onmessage?.({
          data: { type: "ready", generation: message.generation },
        } as MessageEvent)
      )
    if (message.type === "frame") {
      const joints = Array.from({ length: 21 }, (_, i) => ({
        x: target[0] + (i === 8 ? 0 : (i % 4) * 0.01),
        y: target[1] + (i === 8 ? 0 : 0.05 + Math.floor(i / 4) * 0.008),
        z: 0,
      }))
      if (handSpikes && (message.scene as { id: number }).id % 8 === 0)
        joints[8].x += 0.25
      message.bitmap?.close()
      queueMicrotask(() => {
        if (!this.closed)
          this.onmessage?.({
            data: {
              type: "result",
              generation: message.generation,
              scene: message.scene,
              landmarks:
                missingHand ||
                (recoveryBursts &&
                  (message.scene as { timestamp: number }).timestamp % 2600 <
                    700) ||
                (intermittentLoss &&
                  (message.scene as { id: number }).id % 4 === 0)
                  ? []
                  : [joints],
              worldLandmarks: [joints],
              handedness: ["Right"],
            },
          } as MessageEvent)
      })
    }
  }
  terminate() {
    this.closed = true
  }
}
window.Worker = FixtureWorker as unknown as typeof Worker
const audioStats = {
  state: "not started",
  capturing: false,
  locked: 0,
  saved: 0,
  lost: 0,
}
const NativeAudioContext = window.AudioContext
class FixtureAudioContext extends NativeAudioContext {
  constructor() {
    super()
    this.onstatechange = () => {
      audioStats.state = this.state
    }
  }
  createOscillator() {
    const oscillator = super.createOscillator(),
      start = oscillator.start.bind(oscillator),
      stop = oscillator.stop.bind(oscillator)
    oscillator.start = (when) => {
      const frequency = oscillator.frequency.value
      if (frequency === 660) audioStats.capturing = true
      if (frequency === 520) audioStats.locked++
      if (frequency === 880) audioStats.saved++
      if (frequency === 140) audioStats.lost++
      start(when)
    }
    oscillator.stop = (when) => {
      if (oscillator.frequency.value === 660) audioStats.capturing = false
      stop(when)
    }
    return oscillator
  }
}
window.AudioContext = FixtureAudioContext
export function Fixture() {
  const [step, setStep] = useState(0),
    [eyeTransform, setEyeTransform] = useState(DEFAULT_CAMERA_TRANSFORM),
    [reference, setReference] = useState(0),
    [frame, setFrame] = useState<TrackingFrame | null>(null),
    [runtime, setRuntime] = useState("Not tested"),
    [rawVideo, setRawVideo] = useState<string | null>(null),
    [artifact, setArtifact] = useState("")
  const latest = useRef<TrackingFrame | null>(null)
  const status = useCallback(() => {}, [])
  useEffect(() => {
    const timer = setInterval(() => {
      const scale = cornerNoise ? 3.4 : 1
      const perspective = perspectiveMapping ? 1 + 1.5 * (target[0] - 0.5) : 1
      const x =
          ((target[0] - 0.5) * scale) / perspective +
          (badTopLeft && target === points[1] ? 0.2 : 0) +
          (validationBias ? 0.06 : 0) +
          (badValidationPoint && target === points[11] ? 0.14 : 0),
        y =
          ((target[1] - 0.5) * scale) / perspective -
          (validationBias ? 0.04 : 0)
      // A front-facing eye is opposite the outward scene horizontally.
      // The fixture represents a normal view after correcting the raw mount;
      // correction metadata must not transform these adjusted slopes again.
      const eyeX = -x,
        eyeY = y
      let yaw = 0
      if (cornerNoise) yaw = sequence % 2 ? 0.007 : -0.007
      const center: [number, number] = [
        320 - (target[0] - 0.5) * 180,
        240 + (target[1] - 0.5) * 120,
      ]
      eyeContext.fillStyle = "#1f2524"
      eyeContext.fillRect(0, 0, 640, 480)
      eyeContext.fillStyle = "#9ba8a3"
      eyeContext.beginPath()
      eyeContext.ellipse(320, 240, 190, 90, 0, 0, Math.PI * 2)
      eyeContext.fill()
      eyeContext.fillStyle = "#101614"
      eyeContext.beginPath()
      eyeContext.ellipse(...center, 30, 24, 0, 0, Math.PI * 2)
      eyeContext.fill()
      eyeContext.fillStyle = "#c9e8db"
      eyeContext.font = "20px sans-serif"
      eyeContext.fillText("SYNTHETIC EYE", 24, 36)
      const value: TrackingFrame = {
        id: ++sequence,
        timestamp: performance.now(),
        width: 640,
        height: 480,
        roi: { x: 0, y: 0, width: 640, height: 480 },
        processingMs: 5,
        model: {
          center: [320, 240],
          radius: 100,
          residual: 1,
          samples: 90,
          coverage: 0.8,
          ready: true,
        },
        detection: {
          ellipse: lost
            ? null
            : {
                center,
                major: 30,
                minor: 24,
                angle: 0,
                confidence: cornerNoise && sequence % 5 === 0 ? 0.68 : 0.95,
              },
          tracking: lost ? "lost" : "tracking",
          seed: null,
          contour: [],
          refined: [],
          previews: [],
          selected: 0,
          reason: lost ? "Synthetic pupil loss" : "",
        },
        gaze:
          lost || missingGaze
            ? null
            : {
                origin: [0, 0, 0],
                pupil: [0, 0, -1],
                direction: [
                  eyeX * Math.cos(yaw) - Math.sin(yaw),
                  eyeY,
                  -eyeX * Math.sin(yaw) - Math.cos(yaw),
                ],
              },
      }
      latest.current = value
      setFrame(value)
    }, 30)
    return () => clearInterval(timer)
  }, [eyeTransform])
  async function testRuntime() {
    setRuntime("Loading real MediaPipe worker…")
    const worker = new NativeWorker("/vision-runtime/scene-hand.worker.js")
    const timeout = setTimeout(() => {
      setRuntime("FAIL: worker timeout")
      worker.terminate()
    }, 30000)
    worker.onerror = (event) => {
      clearTimeout(timeout)
      setRuntime(`FAIL: ${event.message}`)
      worker.terminate()
    }
    worker.onmessage = async ({ data }) => {
      if (data.type === "ready") {
        const bitmap = await createImageBitmap(raw)
        worker.postMessage(
          {
            type: "frame",
            generation: 1,
            scene: {
              id: 1,
              generation: 1,
              width: 960,
              height: 540,
              timestamp: performance.now(),
            },
            bitmap,
          },
          [bitmap]
        )
      } else {
        clearTimeout(timeout)
        setRuntime(
          data.type === "result"
            ? `PASS: real worker/model/WASM inference; ${data.landmarks.length} hands on synthetic image`
            : `FAIL: ${data.error}`
        )
        worker.terminate()
      }
    }
    worker.postMessage({ type: "init", generation: 1 })
  }
  const tracker = {
    transform: eyeTransform,
    frame,
    latest,
    dimensions: { width: 640, height: 480 },
    source: { kind: "camera", name: "Synthetic eye", deviceId: "fixture-eye" },
    settings: {
      format: "spatial",
      locked: true,
      roi: { x: 0, y: 0, width: 640, height: 480 },
      threshold: 60,
      fov: 60,
      radiusMm: 12,
      corners: null,
    },
    sourceCanvas: { current: eyeCanvas },
  } as TrackerController
  return (
    <main className="eye-app">
      <h1 style={{ fontSize: 16, margin: "12px 4% 0" }}>
        Synthetic scene-camera browser fixture
      </h1>
      <p style={{ fontSize: 12, margin: "4px 4%" }}>
        No physical cameras. Synthetic accuracy only.
      </p>
      <details>
        <summary>Fixture tools</summary>
        <CameraTransformControls
          label="Synthetic eye"
          value={eyeTransform}
          onChange={setEyeTransform}
        />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            padding: "12px 0",
          }}
        >
          <button
            onClick={() => {
              printedMarker = !printedMarker
            }}
          >
            Toggle printed marker
          </button>
          <button
            onClick={() => {
              difficultMarker = !difficultMarker
            }}
          >
            Toggle marker blur and low contrast
          </button>
          <button
            onClick={() => {
              previewCopy = !previewCopy
            }}
          >
            Toggle recursive camera preview
          </button>
          <button onClick={() => void testRuntime()}>
            Test real MediaPipe worker
          </button>
          <button
            onClick={() =>
              void replayHandClip(NativeWorker, setRuntime).catch((error) =>
                setRuntime(`Replay failed: ${error.message}`)
              )
            }
          >
            Replay local hand clip
          </button>
          <button
            onClick={() => {
              const next = (reference + 1) % points.length
              target = points[next]
              setReference(next)
            }}
          >
            Next reference ({reference + 1}/14)
          </button>
          <button
            onClick={() => {
              lost = !lost
            }}
          >
            Toggle pupil loss
          </button>
          <button
            onClick={() => {
              missingHand = !missingHand
            }}
          >
            Toggle hand loss
          </button>
          <button
            onClick={() => {
              missingGaze = !missingGaze
            }}
          >
            Toggle gaze vector loss
          </button>
          <button
            onClick={() => {
              intermittentLoss = !intermittentLoss
            }}
          >
            Toggle intermittent hand loss
          </button>
          <button
            onClick={() => {
              recoveryBursts = !recoveryBursts
            }}
          >
            Toggle hand recovery bursts
          </button>
          <button
            onClick={() => {
              cornerNoise = !cornerNoise
            }}
          >
            Toggle corner eye noise
          </button>
          <button
            onClick={() => {
              perspectiveMapping = !perspectiveMapping
            }}
          >
            Toggle perspective geometry
          </button>
          <button
            onClick={() => {
              badTopLeft = !badTopLeft
            }}
          >
            Toggle bad top-left sample
          </button>
          <button
            onClick={() => {
              handSpikes = !handSpikes
            }}
          >
            Toggle isolated hand spikes
          </button>
          <button
            onClick={() => {
              target = points[1]
              setReference(1)
            }}
          >
            Top-left reference
          </button>
          <button
            onClick={() => {
              target = points[CALIBRATION_TARGETS.length]
              setReference(CALIBRATION_TARGETS.length)
            }}
          >
            First validation reference
          </button>
          <button
            onClick={() => {
              validationBias = !validationBias
            }}
          >
            Toggle validation bias
          </button>
          <button
            onClick={() => {
              badValidationPoint = !badValidationPoint
            }}
          >
            Toggle one bad validation point
          </button>
          <button onClick={() => setStep(0)}>Scene source controls</button>
          <button
            onClick={async () => {
              const link = document.querySelector<HTMLAnchorElement>(
                "a[download^='scene-raw']"
              )
              if (!link) {
                setArtifact("Finalize a video first.")
                return
              }
              const blob = await (await fetch(link.href)).blob()
              setArtifact(`Raw video: ${blob.size} bytes; ${blob.type}`)
              setRawVideo(link.href)
            }}
          >
            Inspect completed raw video
          </button>
        </div>
      </details>
      <output role="status">{runtime}</output>
      <output role="status">Marker pixels: {markerEvidence}</output>
      <output role="status" style={{ display: "block", fontSize: 12 }}>
        Audio {audioStats.state} · Capture tone{" "}
        {audioStats.capturing ? "playing" : "silent"} · Locks{" "}
        {audioStats.locked} · Saved {audioStats.saved} · Interruptions{" "}
        {audioStats.lost}
      </output>
      <p role="status">{artifact}</p>
      {rawVideo && (
        <video
          aria-label="Completed raw scene video"
          src={rawVideo}
          controls
          style={{ width: "100%", maxWidth: 640 }}
          onLoadedMetadata={(e) => {
            const video = e.currentTarget
            setArtifact(
              (current) =>
                `${current}; decoded ${video.videoWidth} × ${video.videoHeight}`
            )
          }}
        />
      )}
      <SceneWorkspace
        tracker={tracker}
        step={step}
        onStepChange={setStep}
        onStatus={status}
        eyeRevision={0}
      />
    </main>
  )
}
createRoot(document.getElementById("root")!).render(<Fixture />)
