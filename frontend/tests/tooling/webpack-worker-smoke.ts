import type {
  SmokeResponse,
  WorkerEntries,
  WorkerName,
} from "./webpack-worker-smoke.types"

declare const WORKER_MANIFEST: WorkerEntries

const entries = WORKER_MANIFEST
const results = document.querySelector<HTMLPreElement>("#results")!
document.querySelector<HTMLPreElement>("#entries")!.textContent =
  JSON.stringify(entries, null, 2)
const active = new Set<Worker>()
function log(label: string, message: string) {
  results.textContent += `\n${new Date().toISOString()} ${label}: ${message}`
}
function stop() {
  for (const worker of active) {
    worker.terminate()
  }
  active.clear()
  log("all", "Stopped")
}
document
  .querySelector<HTMLButtonElement>("#stop")!
  .addEventListener("click", stop)
window.addEventListener("pagehide", stop)
async function blankFrame(worker: Worker, name: WorkerName) {
  const width = 320
  const height = 240
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Canvas context is unavailable.")
  }
  context.fillStyle = "#808080"
  context.fillRect(0, 0, width, height)
  if (name === "tracker") {
    const data = context.getImageData(0, 0, width, height).data
    worker.postMessage(
      {
        type: "frame",
        data,
        width,
        height,
        id: 1,
        timestamp: 100,
        generation: 1,
        includePreviewMasks: false,
        settings: {
          format: "spatial",
          roi: { x: 0, y: 0, width, height },
          threshold: 0,
          thresholdMode: "auto",
          fov: 45,
          radiusMm: 12,
          corners: null,
          locked: false,
        },
      },
      [data.buffer]
    )
    return
  }
  const image = await createImageBitmap(canvas)
  if (name === "head") {
    worker.postMessage(
      {
        type: "frame",
        image,
        id: 1,
        timestamp: 100,
        transform: { rotation: 0, mirrorX: false, mirrorY: false },
      },
      [image]
    )
    return
  }
  worker.postMessage(
    {
      type: "frame",
      frame: image,
      timestamp: 100,
      settings: { roi: { x: 0, y: 0, width, height }, threshold: 0 },
    },
    [image]
  )
}
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "button[data-worker]"
)) {
  button.addEventListener("click", () => {
    const name = button.dataset.worker
    if (name !== "tracker" && name !== "head" && name !== "remote") {
      throw new Error("Invalid worker button.")
    }
    const mode = button.dataset.mode
    const label = mode ? `${name}/${mode}` : name
    log(label, `Starting production classic worker ${entries[name]}`)
    let ready = false
    const worker = new Worker(entries[name])
    active.add(worker)
    const timeout = setTimeout(() => {
      if (!ready && active.has(worker)) {
        log(label, "ERROR: No ready response within 60 seconds")
        worker.terminate()
        active.delete(worker)
      }
    }, 60000)
    worker.addEventListener("error", (event) => {
      clearTimeout(timeout)
      log(
        label,
        `ERROR: ${event.message || "Worker runtime failed"} ${event.filename || ""}`
      )
      worker.terminate()
      active.delete(worker)
    })
    worker.addEventListener("messageerror", () =>
      log(label, "ERROR: Response could not be decoded")
    )
    worker.addEventListener(
      "message",
      async ({ data }: MessageEvent<SmokeResponse>) => {
        if (data.type === "ready") {
          ready = true
          clearTimeout(timeout)
          log(label, `READY${"method" in data ? ": " + data.method : ""}`)
          if (
            document.querySelector<HTMLInputElement>("#send-frame")!.checked
          ) {
            try {
              await blankFrame(worker, name)
              log(label, "Blank frame sent")
            } catch (error) {
              log(
                label,
                `ERROR sending frame: ${error instanceof Error ? error.message : String(error)}`
              )
            }
          }
        } else if (data.type === "error") {
          clearTimeout(timeout)
          log(label, `ERROR: ${data.message}`)
          worker.terminate()
          active.delete(worker)
        } else if (data.type === "pose") {
          log(
            label,
            `FRAME: pose=${JSON.stringify(data.pose)}; expected null for blank image`
          )
        } else if (data.type === "result") {
          const observation = data.observation
          log(
            label,
            `FRAME: ${JSON.stringify({
              reason: observation.reason,
              quality: observation.quality,
              faceBox: observation.faceBox,
              feature: observation.feature,
              method: observation.method,
            })}`
          )
        } else if (data.type === "frame") {
          log(
            label,
            `FRAME: ${JSON.stringify({
              id: data.frame.id,
              reason: data.frame.detection.reason,
              ellipse: data.frame.detection.ellipse,
              gaze: data.frame.gaze,
              processingMs: data.frame.processingMs,
            })}`
          )
        } else {
          log(label, `Unexpected response: ${JSON.stringify(data)}`)
        }
      }
    )
    if (name === "head") {
      worker.postMessage({ type: "initialize" })
    } else if (name === "remote") {
      worker.postMessage({ type: "init", mode })
    }
  })
}
