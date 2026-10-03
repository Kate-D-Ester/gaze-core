import { MAX_FRAME_AGE_MS } from "../scene-eye-tracking/calibration"
import {
  canUseSceneCalibration,
  hasCurrentAccuracyCheck,
} from "../scene-eye-tracking/scene-session"
import type { SceneSessionSnapshot } from "../scene-eye-tracking/scene-session.types"
import type { SceneCameraSnapshot } from "../scene-eye-tracking/scene-camera.types"
import type { ViewerGazeDisplay } from "./viewer-gaze.types"

export function getViewerGaze(
  state: SceneSessionSnapshot,
  camera: SceneCameraSnapshot,
  now: number
): ViewerGazeDisplay {
  const gaze = state.measurement
  const maxAgeMs = MAX_FRAME_AGE_MS + Math.abs(state.delayMs)
  const fresh = (timestamp: number | null | undefined, limit: number) =>
    timestamp !== null &&
    timestamp !== undefined &&
    Number.isFinite(timestamp) &&
    now >= timestamp &&
    now - timestamp <= limit
  const usable =
    canUseSceneCalibration(state) &&
    !state.capture &&
    camera.connection === "live" &&
    fresh(camera.frame?.timestamp, MAX_FRAME_AGE_MS) &&
    fresh(gaze?.eyeTimestamp, maxAgeMs) &&
    fresh(gaze?.sceneTimestamp, maxAgeMs) &&
    (gaze?.valid || gaze?.estimated) &&
    gaze.position?.every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 1
    )
  const verified = hasCurrentAccuracyCheck(state)
  return {
    point: usable ? gaze!.position : null,
    timestamp: gaze?.eyeTimestamp ?? null,
    verified,
    errorRadiusPx: verified ? state.validation?.pixelRms : null,
    resetKey: state.calibration,
    offset: state.offset,
    maxAgeMs,
  }
}
