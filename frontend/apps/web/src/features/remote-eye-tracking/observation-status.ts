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
    blink: "Open your eyes and look at the target",
    "eyes-too-small": "Move closer or use a higher-resolution camera",
    "eyes-out-of-frame": "Bring both eyes into the camera view",
    "invalid-landmarks": "Improve your framing and front lighting",
    "invalid-pose": "Face the camera more directly",
    "invalid-frame": "Waiting for a clear camera frame",
    "invalid-model-geometry": "Improve your framing and front lighting",
  }
  return messages[reason] ?? reason
}
