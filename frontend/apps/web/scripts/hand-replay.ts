import type { ReplayReply } from "./hand-replay.types"
// Local diagnostic fixture only. The clip is copied into ignored dist for a run.
import { HandStability } from "../src/features/scene-eye-tracking/hand-stability"
export async function replayHandClip(
  WorkerType: typeof Worker,
  report: (text: string) => void
) {
  const video = document.createElement("video")
  video.muted = true
  video.preload = "auto"
  const loaded = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Local replay clip did not load.")),
      10000
    )
    video.onloadeddata = () => {
      clearTimeout(timeout)
      resolve()
    }
    video.onerror = () => {
      clearTimeout(timeout)
      reject(new Error("Local replay clip is unavailable."))
    }
  })
  video.src = "/hand-replay.mp4"
  video.load()
  await loaded
  const worker = new WorkerType("/vision-runtime/scene-hand.worker.js")
  let receive: ((message: ReplayReply) => void) | null = null
  worker.onmessage = ({ data }) => receive?.(data)
  const request = (message: object, transfers: Transferable[] = []) =>
    new Promise<ReplayReply>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Hand replay worker timed out.")),
        10000
      )
      receive = (value) => {
        clearTimeout(timeout)
        if (value.type === "error") {
          reject(new Error(value.error))
        } else {
          resolve(value)
        }
      }
      worker.onerror = (event) => {
        clearTimeout(timeout)
        reject(new Error(event.message))
      }
      worker.postMessage(message, transfers)
    })
  try {
    report("Replay loading real MediaPipe…")
    const ready = await request({ type: "init", generation: 1 })
    const stability = new HandStability()
    let detected = 0
    let evaluated = 0
    let missedRun = 0
    let longestMiss = 0
    let flips = 0
    let previousHand = ""
    let totalInference = 0
    let accepted = 0
    const rejectedTimes: number[] = []
    for (let id = 1; id * 0.1 < video.duration; id++) {
      const time = id * 0.1
      const seeked = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Replay seek timed out.")),
          10000
        )
        video.onseeked = () => {
          clearTimeout(timeout)
          resolve()
        }
      })
      video.currentTime = time
      await seeked
      const bitmap = await createImageBitmap(video)
      const value = await request(
        {
          type: "frame",
          generation: 1,
          scene: {
            id,
            generation: 1,
            timestamp: time * 1000,
            width: bitmap.width,
            height: bitmap.height,
          },
          bitmap,
        },
        [bitmap]
      )
      const filtered = stability.apply({
        scene: value.scene,
        landmarks: value.landmarks,
        worldLandmarks: value.worldLandmarks,
        handedness: value.handedness,
      })
      // The hand is visibly present in this interval of the reference clip.
      if (time >= 3 && time < 24) {
        evaluated++
        totalInference += value.inferenceMs ?? 0
        if (value.landmarks.length === 1) {
          detected++
          if (filtered.hand.landmarks.length === 1) {
            accepted++
          } else {
            rejectedTimes.push(time)
          }
          missedRun = 0
          const side = value.handedness[0]
          if (previousHand && previousHand !== side) {
            flips++
          }
          previousHand = side
        } else {
          longestMiss = Math.max(longestMiss, ++missedRun)
        }
      }
      if (id % 25 === 0) {
        report(`Replay ${time.toFixed(1)}s / ${video.duration.toFixed(1)}s`)
      }
    }
    report(
      `Replay done: ${JSON.stringify({ delegate: ready.delegate, evaluated, detected, accepted, rejectedTimes, longestMissingMs: longestMiss * 100, handednessFlips: flips, meanInferenceMs: Math.round(totalInference / evaluated) })}`
    )
  } finally {
    worker.terminate()
    video.removeAttribute("src")
    video.load()
  }
}
