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
  const fresh = hasFreshFrame(camera, now)
  let box: ObjectBox | null = null
  let text = "Select an object in Scene"
  if (role === "scene") {
    box =
      region ??
      (tracking.reference && sameSource(tracking.reference, camera)
        ? tracking.reference.box
        : null)
    text = region ? "Press Select" : "Reference"
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
      text = `${tracking.reference?.label ?? "Object"} · Match ${Math.round(match.score * 100)}%`
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
  if (role === "scene" && !box) {
    return null
  }
  return (
    <span
      className="pointer-events-none absolute inset-0"
      aria-label={`${role} object tracking`}
    >
      {box && (
        <span
          role="img"
          aria-label={`${role} ${role === "scene" ? "reference" : "matched object"} box`}
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
