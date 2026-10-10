import type {
  CalibrationReuseEvent,
  CalibrationReuseState,
} from "./calibration-reuse.types"
/** Candidate corrections never replace accepted state before independent validation. */
export function advanceCalibrationReuse(
  state: CalibrationReuseState,
  event: CalibrationReuseEvent
): CalibrationReuseState {
  switch (event.type) {
    case "check":
      return { ...state, phase: "checking", candidate: null }
    case "candidate":
      return { ...state, phase: "repairing", candidate: event.alignment }
    case "validated":
      return {
        phase: "ready",
        accepted: state.candidate ?? state.accepted,
        candidate: null,
      }
    case "pause":
      return state
    case "cancel":
      return { ...state, phase: "restored", candidate: null }
    case "failed":
      return { ...state, phase: "needs-calibration", candidate: null }
    case "context-changed":
      return { phase: "needs-calibration", accepted: null, candidate: null }
  }
}
