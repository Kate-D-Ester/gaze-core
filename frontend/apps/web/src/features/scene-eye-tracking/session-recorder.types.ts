import type { RecordingResult } from "./recording"

import type { SessionLog } from "./session"

export type SessionRecordingSnapshot = {
  recording: boolean
  finalizing: boolean
  elapsedMs: number
  error: string
  log: SessionLog | null
  sceneVideo: RecordingResult | null
  eyeVideo: RecordingResult | null
  sceneUrl: string | null
  eyeUrl: string | null
  background: HTMLCanvasElement | null
}
