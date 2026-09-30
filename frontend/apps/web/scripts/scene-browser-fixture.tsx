// Browser-only smoke fixture; synthetic sensors never touch the production route.
import { createRoot } from "react-dom/client"
import { useCallback, useEffect, useRef, useState } from "react"
import { SceneWorkspace } from "../src/features/scene-eye-tracking/scene-workspace"
import type { TrackerController } from "../src/features/eye-tracking/use-tracker.types"
import type { TrackingFrame } from "../src/features/eye-tracking/eye-tracking.types"
import "../src/pages/v2.css"
const points = Array.from({ length: 9 }, (_, i) => [
  0.15 + (i % 3) * 0.35,
  0.15 + Math.floor(i / 3) * 0.35,
])
let target = points[0],
  sweepStart = 0,
  lost = false,
  missingHand = false,
  sequence = 0
const raw = document.createElement("canvas")
raw.width = 960
raw.height = 540
const context = raw.getContext("2d")!
function draw() {
  if (sweepStart)
    target =
      points[Math.min(8, Math.floor((performance.now() - sweepStart) / 1800))]
  context.fillStyle = "#182523"
  context.fillRect(0, 0, raw.width, raw.height)
  context.strokeStyle = "#43685e"
  context.lineWidth = 1
  for (let i = 1; i < 3; i++) {
    context.beginPath()
    context.moveTo(i * 320, 0)
    context.lineTo(i * 320, 540)
    context.stroke()
    context.beginPath()
    context.moveTo(0, i * 180)
    context.lineTo(960, i * 180)
    context.stroke()
  }
  context.fillStyle = "#c9e8db"
  context.font = "24px sans-serif"
  context.fillText("SYNTHETIC SCENE · no physical cameras", 30, 36)
  context.fillStyle = "#ffa867"
  context.beginPath()
  context.arc(target[0] * 960, target[1] * 540, 12, 0, Math.PI * 2)
  context.fill()
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
class FixtureWorker {
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
      message.bitmap?.close()
      queueMicrotask(() => {
        if (!this.closed)
          this.onmessage?.({
            data: {
              type: "result",
              generation: message.generation,
              scene: message.scene,
              landmarks: missingHand ? [] : [joints],
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
export function Fixture() {
  const [step, setStep] = useState(0),
    [frame, setFrame] = useState<TrackingFrame | null>(null),
    [runtime, setRuntime] = useState("Not tested")
  const latest = useRef<TrackingFrame | null>(null)
  const status = useCallback(() => {}, [])
  useEffect(() => {
    const timer = setInterval(() => {
      const value = {
        id: ++sequence,
        timestamp: performance.now(),
        width: 640,
        height: 480,
        detection: {
          ellipse: lost ? null : { confidence: 0.95 },
          tracking: lost ? "lost" : "tracking",
        },
        gaze: lost
          ? null
          : { direction: [target[0] - 0.5, target[1] - 0.5, -1] },
      } as TrackingFrame
      latest.current = value
      setFrame(value)
    }, 30)
    return () => clearInterval(timer)
  }, [])
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
    sourceCanvas: { current: raw },
  } as TrackerController
  return (
    <main className="eye-lab">
      <h1>Synthetic scene-camera browser fixture</h1>
      <p>No camera permissions. Synthetic accuracy only.</p>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 0" }}
      >
        <button onClick={() => void testRuntime()}>
          Test real MediaPipe worker
        </button>
        <button
          onClick={() => {
            sweepStart = performance.now()
          }}
        >
          Sweep nine calibration regions
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
        <button onClick={() => setStep(0)}>Scene source controls</button>
      </div>
      <output role="status">{runtime}</output>
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
