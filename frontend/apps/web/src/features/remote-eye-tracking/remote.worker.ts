import type { RemoteProcessor, RemoteRequest, RemoteResponse } from "./types"

let processor: RemoteProcessor | null = null
let processing = false
const respond = (response: RemoteResponse) => self.postMessage(response)
self.onmessage = async (event: MessageEvent<RemoteRequest>) => {
  const request = event.data
  if (request.type === "init") {
    try {
      processor?.dispose()
      processor =
        request.mode === "ir"
          ? await (await import("./ir-processor")).createIrProcessor()
          : await (
              await import("./rgb-processor")
            ).createRgbProcessor(request.mode)
      respond({
        type: "ready",
        method:
          request.mode === "ir"
            ? "IR pupils + face pose / close-up reflection"
            : "Appearance gaze + face pose",
      })
    } catch (error) {
      respond({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Tracking model could not load.",
        fatal: true,
      })
    }
    return
  }
  if (!processor || processing) {
    request.frame.close()
    return
  }
  processing = true
  try {
    respond({
      type: "result",
      observation: {
        ...(await processor.process(
          request.frame,
          request.mediaTimestamp ?? request.timestamp,
          request.settings
        )),
        timestamp: request.timestamp,
      },
    })
  } catch (error) {
    respond({
      type: "error",
      message:
        error instanceof Error ? error.message : "Frame processing failed.",
      fatal: true,
    })
  } finally {
    request.frame.close()
    processing = false
  }
}
