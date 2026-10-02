import { getMjpegBoundary, readMjpegFrames } from "./mjpeg"
import { cameraRelayStreamUrl } from "./camera-relay"
import type { NetworkSource } from "./network-source.types"

const VIDEO_READY_TIMEOUT_MS = 15_000

export async function openNetworkSource(
  input: string,
  signal: AbortSignal
): Promise<NetworkSource> {
  const url = parseNetworkUrl(input)
  throwIfAborted(signal)

  const relayUrl = cameraRelayStreamUrl(url)
  const response = await fetchCameraResponse(relayUrl, signal)
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.toLowerCase().includes("multipart/x-mixed-replace")) {
    return openMjpegSource(url, response, contentType, signal)
  }

  await cancelResponseBody(response)
  return openVideoSource(url, relayUrl, signal)
}

function parseNetworkUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error("Enter a complete HTTP or HTTPS camera stream URL.")
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Use an HTTP or HTTPS network stream URL.")
  }

  return url
}

async function fetchCameraResponse(
  relayUrl: string,
  signal: AbortSignal
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(relayUrl, {
      signal,
    })
  } catch {
    if (signal.aborted) {
      throw createAbortError()
    }

    throw new Error(getCameraRelayErrorMessage())
  }

  if (!response.ok) {
    const detail = await readRelayError(response)
    await cancelResponseBody(response)
    if (response.status === 502 && detail) throw new Error(detail)
    throw new Error(
      `The camera returned HTTP ${response.status}. Check its stream URL and network connection.`
    )
  }

  return response
}

async function openMjpegSource(
  url: URL,
  response: Response,
  contentType: string,
  signal: AbortSignal
): Promise<NetworkSource> {
  const boundary = getMjpegBoundary(contentType)
  if (!boundary) {
    await cancelResponseBody(response)
    throw new Error("The camera returned an invalid MJPEG boundary.")
  }
  if (!response.body) {
    throw new Error("The camera returned an empty MJPEG stream.")
  }

  const frames = readMjpegFrames(response.body, boundary, signal)
  let firstFrame: IteratorResult<Uint8Array>
  try {
    firstFrame = await frames.next()
    throwIfAborted(signal)
  } catch (error) {
    await frames.return(undefined)
    throw error
  }

  if (firstFrame.done) {
    await frames.return(undefined)
    throw new Error("The camera stream contains no JPEG frame.")
  }

  return {
    kind: "mjpeg",
    name: url.hostname,
    firstFrame: firstFrame.value,
    frames,
  }
}

async function openVideoSource(
  url: URL,
  relayUrl: string,
  signal: AbortSignal
): Promise<NetworkSource> {
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.crossOrigin = "anonymous"
  video.src = relayUrl

  try {
    await playVideo(video, signal)
    await waitForVideoDimensions(video, signal)
    throwIfAborted(signal)
  } catch {
    disposeVideo(video)
    if (signal.aborted) {
      throw createAbortError()
    }

    throw new Error(
      "The browser could not play this network video through the camera relay. Check the camera URL and that the local relay is running."
    )
  }

  return {
    kind: "video",
    name: url.hostname,
    video,
  }
}

function playVideo(
  video: HTMLVideoElement,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      if (error) reject(error)
      else resolve()
    }
    const onAbort = () => {
      disposeVideo(video)
      finish(createAbortError())
    }
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
      return
    }
    try {
      video.play().then(() => finish(), finish)
    } catch (error) {
      finish(error)
    }
  })
}

function waitForVideoDimensions(
  video: HTMLVideoElement,
  signal: AbortSignal
): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      finish(new Error("The camera video did not become ready in time."))
    }, VIDEO_READY_TIMEOUT_MS)

    const onLoaded = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        finish()
        return
      }
      finish(new Error("The camera video contains no readable image data."))
    }

    const onError = () => {
      finish(new Error("The browser could not decode this camera stream."))
    }

    const onAbort = () => {
      finish(createAbortError())
    }

    const finish = (error?: Error) => {
      clearTimeout(timeout)
      video.removeEventListener("loadeddata", onLoaded)
      video.removeEventListener("error", onError)
      signal.removeEventListener("abort", onAbort)
      if (error) {
        reject(error)
        return
      }
      resolve()
    }

    video.addEventListener("loadeddata", onLoaded, { once: true })
    video.addEventListener("error", onError, { once: true })
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
    }
  })
}

async function cancelResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {})
}

async function readRelayError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error
    }
  } catch {
    /* Camera errors can also be plain text or an empty response. */
  }
  return ""
}

function disposeVideo(video: HTMLVideoElement): void {
  video.pause()
  video.removeAttribute("src")
  video.load()
}

function getCameraRelayErrorMessage(): string {
  return "The local camera relay is not running or this app origin is not allowed. Start it from frontend/apps/web with `bun run camera-relay`, then reconnect. For a hosted app, add its origin to GAZE_CAMERA_RELAY_ALLOWED_ORIGINS."
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createAbortError()
  }
}

function createAbortError(): DOMException {
  return new DOMException("The camera source was stopped.", "AbortError")
}
