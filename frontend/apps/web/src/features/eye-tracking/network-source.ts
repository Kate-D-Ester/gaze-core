import { getMjpegBoundary, readMjpegFrames } from "./mjpeg"
import type { NetworkSource } from "./network-source.types"

const VIDEO_READY_TIMEOUT_MS = 15_000

export async function openNetworkSource(
  input: string,
  signal: AbortSignal
): Promise<NetworkSource> {
  const url = parseNetworkUrl(input)
  throwIfAborted(signal)

  const response = await fetchCameraResponse(url, signal)
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

async function fetchCameraResponse(
  url: URL,
  signal: AbortSignal
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url.href, {
      mode: "cors",
      signal,
    })
  } catch (error) {
    if (signal.aborted) {
      throw createAbortError()
    }

    throw new Error(
      "The browser could not access this camera. Check the URL and allow cross-origin access (CORS) on the camera."
    )
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
  } catch (error) {
    disposeVideo(video)
    if (signal.aborted) {
      throw createAbortError()
    }

    throw new Error(
      "This network source is not browser-playable. Check the URL and allow cross-origin access (CORS) so the browser can read its frames."
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

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createAbortError()
  }
}

function createAbortError(): DOMException {
  return new DOMException("The camera source was stopped.", "AbortError")
}
