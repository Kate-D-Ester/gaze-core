import { Move3D } from "lucide-react"
import { RemoteDetailsStyles } from "@/features/tracking-ui/remote-styles"
import { degrees } from "./readout-format"
import type { CalibratedHeadRangeProps } from "./calibrated-head-range.types"
export function CalibratedHeadRange({ calibration }: CalibratedHeadRangeProps) {
  return (
    <details className={`remote-details ${RemoteDetailsStyles}`}>
      <summary aria-label="Calibrated head range">
        <Move3D size={16} />
        Head range
      </summary>
      {calibration.poseKind === "face" && (
        <p>
          Yaw {degrees(calibration.poseBounds.min[0]!)}–
          {degrees(calibration.poseBounds.max[0]!)} · Pitch{" "}
          {degrees(calibration.poseBounds.min[1]!)}–
          {degrees(calibration.poseBounds.max[1]!)}
        </p>
      )}
      <p>
        X {(calibration.poseBounds.min[3]! * 100).toFixed(0)}–
        {(calibration.poseBounds.max[3]! * 100).toFixed(0)}% · Y{" "}
        {(calibration.poseBounds.min[4]! * 100).toFixed(0)}–
        {(calibration.poseBounds.max[4]! * 100).toFixed(0)}%
      </p>
      <p>
        Scale {(Math.exp(calibration.poseBounds.min[5]!) * 100).toFixed(1)}–
        {(Math.exp(calibration.poseBounds.max[5]!) * 100).toFixed(1)}%
      </p>
    </details>
  )
}
