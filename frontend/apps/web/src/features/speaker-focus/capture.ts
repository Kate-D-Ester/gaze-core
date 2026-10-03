import type {
  CaptureMessage,
  CaptureOptions,
  MicrophoneOptions,
} from "./capture.types"
export { PcmResampler } from "./resampler"
export function packetBytes(
  kind: 1 | 2,
  generation: number,
  timestamp: number,
  payload: ArrayBuffer
): ArrayBuffer {
  if (
    !Number.isInteger(generation) ||
    generation < 0 ||
    generation > 0xffffffff ||
    !Number.isFinite(timestamp) ||
    timestamp < 0 ||
    payload.byteLength > 200000
  ) {
    throw new Error("Invalid live packet")
  }
  const bytes = new Uint8Array(24 + payload.byteLength)
  bytes.set([71, 83, 80, 49])
  const view = new DataView(bytes.buffer)
  view.setUint8(4, kind)
  view.setUint32(8, generation, true)
  view.setFloat64(12, timestamp, true)
  view.setUint32(20, payload.byteLength, true)
  bytes.set(new Uint8Array(payload), 24)
  return bytes.buffer
}
export async function startMicrophone(
  options: MicrophoneOptions
): Promise<MediaStream> {
  if (!options.syncVerified) {
    throw new Error("Check camera/microphone synchronization before starting")
  }
  if (options.source === "network") {
    throw new Error(
      "Network camera capture timestamps are unavailable; use a USB camera or synchronized clip"
    )
  }
  options.signal?.throwIfAborted()
  const request =
    options.getUserMedia ??
    navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  let stream: MediaStream
  try {
    stream = await request({
      video: false,
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
  } catch {
    throw new Error(
      "Allow the separate microphone, then start live capture again"
    )
  }
  if (options.signal?.aborted) {
    stream.getTracks().forEach((track) => track.stop())
    options.signal.throwIfAborted()
  }
  return stream
}
export async function startCapture(
  stream: MediaStream,
  options: CaptureOptions
): Promise<() => void> {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let node: AudioWorkletNode | null = null
  const stop = () => {
    if (stopped) {
      return
    }
    stopped = true
    if (timer) {
      clearInterval(timer)
    }
    options.signal.removeEventListener("abort", stop)
    if (node) {
      node.port.onmessage = null
      node.disconnect()
    }
    source?.disconnect()
    stream.getTracks().forEach((track) => track.stop())
  }
  options.signal.addEventListener("abort", stop, { once: true })
  try {
    await options.context.audioWorklet.addModule(
      "/vision-runtime/audio-capture.worklet.js"
    )
    options.signal.throwIfAborted()
    await options.context.resume()
    const origin = performance.now() / 1000 - options.context.currentTime
    source = options.context.createMediaStreamSource(stream)
    node = new AudioWorkletNode(options.context, "speaker-pcm", {
      channelCount: 1,
      channelCountMode: "explicit",
      numberOfOutputs: 1,
    })
    let generation = options.generation()
    node.port.postMessage({ generation })
    node.port.onmessage = (event: MessageEvent<CaptureMessage>) => {
      if (stopped || event.data.generation !== options.generation()) {
        return
      }
      const timestamp = origin + event.data.timestamp
      const pcm = new Float32Array(event.data.pcm)
      options.onPcm(pcm, timestamp, event.data.generation)
      options.onPacket(
        packetBytes(1, event.data.generation, timestamp, event.data.pcm)
      )
    }
    source.connect(node)
    node.connect(options.context.destination)
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("Live frame capture is unavailable")
    }
    const initial = options.camera.latest?.generation
    let last = -1
    let encoding = false
    timer = setInterval(() => {
      const next = options.generation()
      if (next !== generation) {
        generation = next
        node?.port.postMessage({ generation })
      }
      const frame = options.camera.latest
      if (
        !frame ||
        frame.generation !== initial ||
        performance.now() - frame.timestamp > 150
      ) {
        options.onError(
          "Scene source changed or became stale; restart live capture"
        )
        stop()
        return
      }
      if (frame.id === last || encoding) {
        return
      }
      last = frame.id
      encoding = true
      const scale = Math.min(1, 640 / frame.width, 480 / frame.height)
      canvas.width = Math.round(frame.width * scale)
      canvas.height = Math.round(frame.height * scale)
      context.drawImage(
        options.camera.rawCanvas,
        0,
        0,
        canvas.width,
        canvas.height
      )
      const capturedGeneration = generation
      const timestamp = frame.timestamp / 1000
      void createImageBitmap(canvas)
        .then((image) => {
          if (stopped || capturedGeneration !== options.generation()) {
            image.close()
            return
          }
          options.onFrame(image, timestamp, capturedGeneration)
        })
        .catch(() => {
          options.onError("Live preview failed")
        })
      canvas.toBlob(
        (blob) => {
          encoding = false
          if (!blob || stopped || capturedGeneration !== options.generation()) {
            return
          }
          void blob
            .arrayBuffer()
            .then((bytes) => {
              if (!stopped && capturedGeneration === options.generation()) {
                options.onPacket(
                  packetBytes(2, capturedGeneration, timestamp, bytes)
                )
              }
            })
            .catch(() => options.onError("Live video encoding failed"))
        },
        "image/jpeg",
        0.7
      )
    }, 70)
    return stop
  } catch (error) {
    stop()
    throw error
  }
}
