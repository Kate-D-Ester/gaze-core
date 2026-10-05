import { hasFreshFrame } from "./selection"
import { sameSource } from "./object-tracking"
import type { ObjectBox, ObjectOverlayProps } from "./object-tracking.types"

export function ObjectOverlay({
  role,
  tracking,
  camera,
  now,
  region,
}: ObjectOverlayProps) {
  const name = role === "auxiliary" ? "target" : "scene"
  const fresh = hasFreshFrame(camera, now)
  let box: ObjectBox | null = null
  let text = "Select an object in Scene"
  if (role === "scene") {
    const followed = tracking.scene
    const current =
      fresh &&
      followed &&
      sameSource(followed, camera) &&
      now >= followed.timestamp &&
      now - followed.timestamp <= 500
    if (tracking.reference) {
      box = current ? followed.box : null
      text = current ? "Tracking" : "Searching"
    } else {
      box = region ?? null
      text = tracking.status === "selecting" ? "Selecting…" : "Selection"
    }
  } else {
    const match = tracking.match
    const current =
      fresh &&
      match &&
      sameSource(match, camera) &&
      now >= match.timestamp &&
      now - match.timestamp <= 500
    if (current) {
      box = match.box
      text = `Locked · ${Math.round(match.score * 100)}%`
      if (match.method === "temporal" || match.method === "flow") {
        text = "Tracking"
      }
      if (match.method === "appearance") {
        text = "Matched appearance"
      }
    } else if (tracking.status === "selecting") {
      text = "Selecting…"
    } else if (tracking.status === "error") {
      text = tracking.error
    } else if (tracking.reference) {
      text =
        tracking.status === "ambiguous"
          ? "Ambiguous · similar objects"
          : "Searching"
    }
  }
  if (!fresh) {
    box = null
  }
  if (role === "scene" && !box && !tracking.reference) {
    return null
  }
  return (
    <span
      className="pointer-events-none absolute inset-0"
      aria-label={`${name} object tracking`}
    >
      {box && (
        <span
          role="img"
          aria-label={`${name} ${role === "scene" ? "reference" : "matched object"} box`}
          className={`absolute rounded-sm border-2 ${role === "scene" ? "border-primary/80" : "border-cyan-300 shadow-[0_0_0_1px_#0008]"}`}
          style={{
            left: `${box[0] * 100}%`,
            top: `${box[1] * 100}%`,
            width: `${(box[2] - box[0]) * 100}%`,
            height: `${(box[3] - box[1]) * 100}%`,
          }}
        />
      )}
      <span
        className={`absolute left-2 max-w-[calc(100%-1rem)] rounded bg-black/75 px-2 py-1 text-left text-[11px] leading-snug text-white ${role === "scene" ? "top-2" : "bottom-2"}`}
        role="status"
        aria-live="polite"
      >
        {text}
      </span>
    </span>
  )
}
