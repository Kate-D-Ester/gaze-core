import { ViewerEyeCamera } from "../../apps/web/src/features/camera-viewer/eye-camera"
import { createViewerTracker } from "./fixtures"
import type { SceneCameraSnapshot } from "../../apps/web/src/features/scene-eye-tracking/scene-camera.types"
import { createElement } from "../../apps/web/node_modules/react"
import { createRoot } from "../../apps/web/node_modules/react-dom/client"
import { ViewerWorkspace } from "../../apps/web/src/features/camera-viewer/viewer-workspace"
import { loadVoiceDecoder } from "../../apps/web/src/features/camera-viewer/voice-decoder"
import type { VoiceSessionFactory } from "../../apps/web/src/features/camera-viewer/local-voice.types"
import { SceneCamera } from "../../apps/web/src/features/scene-eye-tracking/scene-camera"
import { calibrate } from "../scene-eye-tracking/fixtures"

const fixture = calibrate()
const session = fixture.s
let sequence = fixture.id + 1
const cameras = ["Eye", "Scene", "Auxiliary"].map((name, index) => {
  const camera = new SceneCamera()
  const listeners = new Set<() => void>()
  let connected = true
  let droppedUntil = 0
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
    camera.latest = null
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
    if (!connected || now < droppedUntil) return
    state = {
      ...state,
      connection: "live",
      busy: false,
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
  const interrupt = () => {
    droppedUntil = Infinity
    camera.latest = null
    state = { ...state, frame: null, connection: "reconnecting", busy: true }
    listeners.forEach((callback) => callback())
  }
  return {
    camera,
    tick,
    interrupt,
    resume: () => {
      droppedUntil = 0
    },
  }
})
const eyeTracker = createViewerTracker()
eyeTracker.stop = cameras[0].camera.stop
eyeTracker.sourceCanvas.current = cameras[0].camera.rawCanvas
const eyeCamera = new ViewerEyeCamera(eyeTracker)
const updateEye = () => {
  const state = cameras[0].camera.getSnapshot()
  const feature = [
    Math.sin(performance.now() / 2500) * 0.25,
    Math.cos(performance.now() / 2500) * 0.2,
  ]
  eyeCamera.update({
    ...eyeTracker,
    connection: state.connection,
    frame: state.frame
      ? {
          ...eyeTracker.frame!,
          id: state.frame.id,
          timestamp: state.frame.timestamp,
          detection: {
            ...eyeTracker.frame!.detection,
            ellipse: {
              center: [320 + feature[0] * 200, 240 + feature[1] * 200],
              major: 25,
              minor: 18,
              angle: 0.2,
              confidence: 0.95,
            },
          },
        }
      : null,
  })
}
updateEye()
// Replace only microphone input: the real decoder, controller and command dispatch remain in use.
const generatedVoiceSession: VoiceSessionFactory = async (
  handler,
  signal,
  onFailure,
  onRejected
) => {
  const output = document.getElementById("voice-result")!
  const abort = new AbortController()
  const context = new AudioContext()
  let node: AudioWorkletNode | null = null
  let source: AudioBufferSourceNode | null = null
  let stopped = false
  const cleanup = () => {
    if (stopped) return
    stopped = true
    abort.abort()
    signal.removeEventListener("abort", cleanup)
    if (node) {
      node.port.onmessage = null
      node.port.close()
      node.disconnect()
    }
    source?.disconnect()
    void context.close()
  }
  signal.addEventListener("abort", cleanup, { once: true })
  try {
    signal.throwIfAborted()
    output.textContent = "Loading local model…"
    await context.resume()
    const decoder = await loadVoiceDecoder(
      AbortSignal.any([signal, abort.signal]),
      onFailure
    )
    await context.audioWorklet.addModule("/voice-runtime/microphone.worklet.js")
    const response = await fetch("/select.wav", { signal })
    const speech = await context.decodeAudioData(await response.arrayBuffer())
    signal.throwIfAborted()
    const buffer = context.createBuffer(
      1,
      speech.length + context.sampleRate * 3,
      context.sampleRate
    )
    buffer.getChannelData(0).set(speech.getChannelData(0))
    source = context.createBufferSource()
    source.buffer = buffer
    node = new AudioWorkletNode(context, "viewer-microphone")
    node.port.onmessage = (event) =>
      decoder.accept(event.data, context.sampleRate)
    decoder.listen(
      context.sampleRate,
      (text) => {
        output.textContent =
          "Recognized: " + text + " · " + context.sampleRate + " Hz"
        handler(text)
      },
      onFailure,
      onRejected
    )
    source.connect(node)
    node.connect(context.destination)
    source.start()
    output.textContent = "Recognizing generated select…"
    return { stop: cleanup }
  } catch (failure) {
    cleanup()
    throw failure
  }
}

createRoot(document.getElementById("viewer")!).render(
  createElement(ViewerWorkspace, {
    eyeCamera,
    sceneCamera: cameras[1].camera,
    auxiliaryCamera: cameras[2].camera,
    gazeSession: session,
    setupStatus: "Synthetic calibration",
    voiceSessionFactory: generatedVoiceSession,
  })
)
let publicView = false
let blankAuxiliary = false
const publicImage = new Image()
publicImage.src = "/public-bus.jpg"
document.getElementById("public-object")!.onclick = () => {
  publicView = !publicView
  if (publicView) {
    cameras[0].camera.stop()
    session.invalidate()
  }
}
document.getElementById("blank-auxiliary")!.onclick = () => {
  blankAuxiliary = !blankAuxiliary
}
const drawPublicFrames = () => {
  if (!publicView || !publicImage.complete) {
    return
  }
  const scene = cameras[1].camera.rawCanvas.getContext("2d")!
  scene.drawImage(publicImage, 0, 0, 640, 480)
  const auxiliary = cameras[2].camera.rawCanvas.getContext("2d")!
  auxiliary.fillStyle = "#111"
  auxiliary.fillRect(0, 0, 640, 480)
  if (!blankAuxiliary) {
    auxiliary.save()
    auxiliary.translate(320 + Math.sin(performance.now() / 1800) * 12, 240)
    auxiliary.rotate((5 * Math.PI) / 180)
    auxiliary.drawImage(publicImage, -300, -220, 600, 440)
    auxiliary.restore()
  }
}
let gazeEnabled = true
document.getElementById("pause-gaze")!.onclick = () => {
  gazeEnabled = !gazeEnabled
}
let framesPaused = false
document.getElementById("drop-frames")!.onclick = () => {
  framesPaused = !framesPaused
  cameras
    .slice(0, 2)
    .forEach((camera) => (framesPaused ? camera.interrupt() : camera.resume()))
  document.getElementById("drop-frames")!.textContent = framesPaused
    ? "Resume frames"
    : "Drop frames"
  updateEye()
}
setInterval(() => {
  drawPublicFrames()
  const now = performance.now()
  sequence++
  cameras.forEach((camera) => camera.tick(now))
  updateEye()
  if (gazeEnabled && !publicView && cameras[0].camera.getSnapshot().frame)
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
  session.measure(cameras[1].camera.latest, now)
  document.getElementById("feed-result")!.textContent =
    (cameras.slice(0, 2).every(({ camera }) => camera.getSnapshot().frame)
      ? "Feeds live"
      : "Frames paused") +
    (session.getSnapshot().calibration
      ? " · calibration retained"
      : " · calibration missing")
}, 100)
