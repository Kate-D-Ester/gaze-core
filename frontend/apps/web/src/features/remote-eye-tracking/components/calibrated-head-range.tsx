import { remotePoseBounds } from "../calibration"
import { Move3D } from "lucide-react"
import { RemoteDetailsStyles } from "@/features/tracking-ui/remote-styles"
import { degrees } from "./readout-format"
import type { CalibratedHeadRangeProps } from "./calibrated-head-range.types"
export function CalibratedHeadRange({ calibration }: CalibratedHeadRangeProps) {
  const bounds = remotePoseBounds(calibration)
  let correctionStatus = "No additional motion correction learned."
  if (calibration.inputKind !== "base-point") {
    correctionStatus =
      "Eye and head features fitted together; accuracy is checked separately."
  }
  if (calibration.headCorrection) {
    correctionStatus =
      "Local motion correction learned; other head positions remain unverified."
  }
  if (calibration.motionFit) {
    correctionStatus =
      "Motion hold fitted with the gaze grid; other head positions remain unverified."
  }
  return (
    <details className={`remote-details ${RemoteDetailsStyles}`}>
      <summary aria-label="Calibrated head range">
        <Move3D size={16} />
        Head range
      </summary>
      <p>{correctionStatus}</p>
      {calibration.poseKind === "face" && (
        <p>
          Yaw {degrees(bounds.min[0]!)}–{degrees(bounds.max[0]!)} · Pitch{" "}
          {degrees(bounds.min[1]!)}–{degrees(bounds.max[1]!)}
        </p>
      )}
      <p>
        X {(bounds.min[3]! * 100).toFixed(0)}–
        {(bounds.max[3]! * 100).toFixed(0)}% · Y{" "}
        {(bounds.min[4]! * 100).toFixed(0)}–{(bounds.max[4]! * 100).toFixed(0)}%
      </p>
      <p>
        Scale {(Math.exp(bounds.min[5]!) * 100).toFixed(1)}–
        {(Math.exp(bounds.max[5]!) * 100).toFixed(1)}%
      </p>
    </details>
  )
}
