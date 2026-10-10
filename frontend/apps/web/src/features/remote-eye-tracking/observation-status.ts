/** Turn detector status codes into setup guidance without changing the raw exported observation. */
export function observationStatus(
  reason: string | null | undefined
): string | null {
  if (!reason) {
    return null
  }
  const messages: Record<string, string> = {
    "face-not-found": "Face the camera so both eyes are visible",
    "multiple-faces": "Keep one person in the camera view",
    blink: "Eyes closed or partly covered — keep your irises visible",
    "eyes-too-small": "Move closer or use a higher-resolution camera",
    "eyes-out-of-frame": "Bring both eyes into the camera view",
    "invalid-landmarks": "Improve your framing and front lighting",
    "invalid-pose": "Face the camera more directly",
    "head-pose-too-extreme":
      "Turn slightly toward the camera so both eyes stay clear",
    "pose-unavailable": "Keep your face visible in even lighting",
    "invalid-appearance-prediction": "Waiting for a clear eye image",
    "stale-frame": "Waiting for the next camera frame",
    "invalid-frame": "Waiting for a clear camera frame",
    "invalid-model-geometry": "Improve your framing and front lighting",
  }
  return messages[reason] ?? reason
}
