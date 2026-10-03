import type { SceneCameraSnapshot } from "../../apps/web/src/features/scene-eye-tracking/scene-camera.types"
import { createElement } from "../../apps/web/node_modules/react"
import { createRoot } from "../../apps/web/node_modules/react-dom/client"
import { ViewerWorkspace } from "../../apps/web/src/features/camera-viewer/viewer-workspace"
import { loadVoiceDecoder } from "../../apps/web/src/features/camera-viewer/voice-decoder"
import { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"
import { calibrate } from "../scene-eye-tracking/fixtures"

const fixture = calibrate()
const session = fixture.s
let sequence = fixture.id + 1
const cameras = ["Eye", "Scene", "Auxiliary"].map((name, index) => {
  const camera = new SceneCamera()
  const listeners = new Set<() => void>()
  let connected = true
  let state: SceneCameraSnapshot = {
    ...camera.getSnapshot(),
    connection: "live" as const,
    source: { kind: "camera" as const, key: name, name, deviceId: name },
    frame: {
      id: sequence,
      generation: 1,
      timestamp: performance.now(),
      width: 640,
      height: 480,
    },
  }
  camera.rawCanvas.width = 640
  camera.rawCanvas.height = 480
  const ctx = camera.rawCanvas.getContext("2d")!
  ctx.fillStyle = ["#1b2828", "#28302a", "#282a32"][index]
  ctx.fillRect(0, 0, 640, 480)
  ctx.strokeStyle = "#607070"
  for (let x = 0; x <= 640; x += 80) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, 480)
    ctx.stroke()
  }
  for (let y = 0; y <= 480; y += 80) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(640, y)
    ctx.stroke()
  }
  ctx.fillStyle = "#a0b0a8"
  ctx.font = "24px sans-serif"
  ctx.fillText("Synthetic " + name + " feed", 20, 38)
  camera.getSnapshot = () => state
  camera.subscribe = (callback) => {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  }
  camera.stop = () => {
    connected = false
    state = { ...state, connection: "idle", frame: null, source: null }
    listeners.forEach((callback) => callback())
  }
  camera.startCamera = async () => {
    connected = true
  }
  camera.setTransform = (transform) => {
    state = { ...state, transform }
    session.invalidate()
    listeners.forEach((callback) => callback())
  }
  const tick = (now: number) => {
    if (!connected) return
    state = {
      ...state,
      frame: {
        id: sequence,
        generation: 1,
        timestamp: now,
        width: 640,
        height: 480,
      },
    }
    camera.latest = state.frame
    listeners.forEach((callback) => callback())
  }
  return { camera, tick }
})
createRoot(document.getElementById("viewer")!).render(
  createElement(ViewerWorkspace, {
    eyeCamera: cameras[0].camera,
    sceneCamera: cameras[1].camera,
    auxiliaryCamera: cameras[2].camera,
    gazeSession: session,
    setupStatus: "Synthetic calibration",
  })
)
let gazeEnabled = true
document.getElementById("pause-gaze")!.onclick = () => {
  gazeEnabled = !gazeEnabled
}
setInterval(() => {
  const now = performance.now()
  sequence++
  if (gazeEnabled)
    session.addEye(
      {
        id: sequence,
        timestamp: now,
        feature: [Math.sin(now / 2500) * 0.25, Math.cos(now / 2500) * 0.2],
        valid: true,
        confidence: 0.95,
      },
      now
    )
  cameras.forEach((camera) => camera.tick(now))
  session.measure(cameras[1].camera.latest, now)
}, 100)

document.getElementById("voice-test")!.onclick = async () => {
  const output = document.getElementById("voice-result")!
  const abort = new AbortController()
  const context = new AudioContext()
  let decoder: Awaited<ReturnType<typeof loadVoiceDecoder>> | null = null
  let node: AudioWorkletNode | null = null
  let source: AudioBufferSourceNode | null = null
  const cleanup = () => {
    abort.abort()
    node?.disconnect()
    source?.disconnect()
    void context.close()
  }
  try {
    output.textContent = "Loading local model…"
    await context.resume()
    decoder = await loadVoiceDecoder(abort.signal)
    await context.audioWorklet.addModule("/voice-runtime/microphone.worklet.js")
    const response = await fetch("/scene.wav")
    const speech = await context.decodeAudioData(await response.arrayBuffer())
    const buffer = context.createBuffer(
      1,
      speech.length + context.sampleRate * 3,
      context.sampleRate
    )
    buffer.getChannelData(0).set(speech.getChannelData(0))
    source = context.createBufferSource()
    source.buffer = buffer
    node = new AudioWorkletNode(context, "viewer-microphone")
    const activeDecoder = decoder
    node.port.onmessage = (event) =>
      activeDecoder.accept(event.data, context.sampleRate)
    decoder.listen(
      context.sampleRate,
      (text) => {
        output.textContent =
          "Recognized: " + text + " · " + context.sampleRate + " Hz"
        cleanup()
      },
      (failure) => {
        output.textContent = "Failed: " + String(failure)
        cleanup()
      }
    )
    source.connect(node)
    node.connect(context.destination)
    source.start()
    output.textContent = "Recognizing synthetic speech locally…"
    setTimeout(() => {
      if (!abort.signal.aborted) {
        output.textContent = "No final command recognized"
        cleanup()
      }
    }, 15000)
  } catch (failure) {
    output.textContent = "Failed: " + String(failure)
    cleanup()
  }
}
