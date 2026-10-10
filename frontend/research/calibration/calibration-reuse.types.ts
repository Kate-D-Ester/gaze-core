import type { SessionAlignment } from "../../apps/web/src/features/tracking-calibration/session-alignment.types"
export type CalibrationReuseState = {
  phase: "restored" | "checking" | "repairing" | "ready" | "needs-calibration"
  accepted: SessionAlignment | null
  candidate: SessionAlignment | null
}
export type CalibrationReuseEvent =
  | { type: "check" | "pause" | "cancel" | "failed" | "context-changed" }
  | { type: "candidate"; alignment: SessionAlignment }
  | { type: "validated" }
