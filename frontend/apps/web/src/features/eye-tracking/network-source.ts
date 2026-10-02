import { getMjpegBoundary, readMjpegFrames } from "./mjpeg"
import type { CameraResponse, NetworkSource } from "./network-source.types"

const VIDEO_READY_TIMEOUT_MS = 15_000

export async function openNetworkSource(
  input: string,
  signal: AbortSignal
): Promise<NetworkSource> {
  const requestedUrl = parseNetworkUrl(input)
  throwIfAborted(signal)

  const { url, response } = await openCameraResponse(requestedUrl, signal)
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.toLowerCase().includes("multipart/x-mixed-replace")) {
    return openMjpegSource(url, response, contentType, signal)
  }

  await cancelResponseBody(response)
  return openVideoSource(url, signal)
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

async function openCameraResponse(
  url: URL,
  signal: AbortSignal
): Promise<CameraResponse> {
  const fallback = getEsp32StreamFallback(url)
  try {
    const response = await fetchCameraResponse(url, signal)
    const contentType = response.headers.get("content-type") ?? ""
    if (!fallback || !contentType.toLowerCase().includes("text/html")) {
      return { url, response }
    }
    await cancelResponseBody(response)
  } catch (error) {
    if (!fallback || signal.aborted) throw error
  }

  throwIfAborted(signal)
  return {
    url: fallback,
    response: await fetchCameraResponse(fallback, signal),
  }
}

function getEsp32StreamFallback(url: URL): URL | null {
  if (url.protocol !== "http:" || url.port || url.pathname !== "/stream")
    return null
  if (!isLocalCameraHost(url.hostname)) return null
  const fallback = new URL(url.href)
  fallback.port = "81"
  return fallback
}

function isLocalCameraHost(hostname: string): boolean {
  if (hostname.endsWith(".local")) return true
  const octets = hostname.split(".").map(Number)
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  )
    return false
  if (octets[0] === 10) return true
  if (octets[0] === 192 && octets[1] === 168) return true
  return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31
}

async function fetchCameraResponse(
  url: URL,
  signal: AbortSignal
): Promise<Response> {
  let response: Response
  throwIfAborted(signal)
  try {
    response = await fetch(url.href, {
      mode: "cors",
      signal,
    })
  } catch {
    if (signal.aborted) {
      throw createAbortError()
    }

    throw new Error(getCameraAccessErrorMessage(url))
  }

  if (!response.ok) {
    await cancelResponseBody(response)
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
  signal: AbortSignal
): Promise<NetworkSource> {
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.crossOrigin = "anonymous"
  video.src = url.href

  try {
    await video.play()
    await waitForVideoDimensions(video, signal)
  } catch {
    disposeVideo(video)
    if (signal.aborted) {
      throw createAbortError()
    }

    throw new Error(
      "The browser could not play this network video. Check that its URL is reachable and that the camera allows this app's origin with CORS."
    )
  }

  return {
    kind: "video",
    name: url.hostname,
    video,
  }
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

function disposeVideo(video: HTMLVideoElement): void {
  video.pause()
  video.removeAttribute("src")
  video.load()
}

function getCameraAccessErrorMessage(url: URL): string {
  let streamPortHint = ""
  if (!url.port && url.pathname === "/stream") {
    const esp32StreamUrl = new URL(url.href)
    esp32StreamUrl.port = "81"
    streamPortHint =
      `If this is the standard ESP32 CameraWebServer, try ${esp32StreamUrl.href};` +
      " its stream endpoint uses port 81."
  }

  let appOrigin = window.location.origin
  if (appOrigin === "null") {
    appOrigin = "this app's origin"
  }

  const message = [
    `The browser could not reach or read ${url.href}. Confirm ${url.hostname} resolves`,
    "and the camera is reachable from this device on the same network.",
    streamPortHint,
    `If it is reachable, the camera must return Access-Control-Allow-Origin: ${appOrigin}`,
    "so the browser can read its frames.",
  ]

  return message.filter(Boolean).join(" ")
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createAbortError()
  }
}

function createAbortError(): DOMException {
  return new DOMException("The camera source was stopped.", "AbortError")
}
