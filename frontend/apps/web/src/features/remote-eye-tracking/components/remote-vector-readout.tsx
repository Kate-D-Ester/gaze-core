import { Hint } from "../remote-controls"
import type { RemoteVectorReadoutProps } from "./remote-vector-readout.types"

function formatVector(values: number[] | undefined | null): string {
  if (!values || !values.every(Number.isFinite)) {
    return "—"
  }
  return values.map((value) => value.toFixed(3)).join(", ")
}

export function RemoteVectorReadout({
  vectors,
  beforeHeadCorrection,
  afterHeadCorrection,
  headCorrectionActive,
  jointMotion = false,
}: RemoteVectorReadoutProps) {
  let correctionLabel = "Learned head correction off"
  if (headCorrectionActive) {
    correctionLabel = "Learned head correction on"
  }
  let correctionHint = `${correctionLabel}. Normalized screen X, Y before → after the additional learned correction. The underlying estimator can already use head features. Manual offsets and return alignment are not included. This comparison does not measure accuracy.`
  if (jointMotion) {
    correctionHint =
      "Eye and head features fitted together using the motion hold. Normalized screen X, Y; manual offsets and return alignment are not included. This is not an independent accuracy measurement."
  }
  return (
    <div
      className="relative border-t border-[var(--line)] px-3.5 py-3 text-[11px] text-[var(--dim)] [&_.remote-hint]:static [&_.remote-tooltip]:right-3.5 [&_.remote-tooltip]:left-3.5 [&_.remote-tooltip]:w-auto [&_.remote-tooltip]:max-w-none [&_.remote-tooltip]:[transform:none]"
      aria-label="Tracking vectors"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span>Face 3D · eyes 2D (×4)</span>
        <Hint label="Eye arrows show measured iris or pupil movement, enlarged four times. They are not calibrated 3D gaze rays. Image axes: X right, Y down; face Z toward the camera. Preview mirroring affects display only.">
          <span className="underline decoration-dotted underline-offset-4">
            Camera axes
          </span>
        </Hint>
      </div>
      <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
        <Hint label="Face unit direction: X, Y, Z in camera axes. A straight-facing head points toward the camera.">
          <span className="text-[#8bd3ed]">Face</span>
          <output
            className="font-mono tabular-nums"
            aria-label="Face direction vector"
          >
            {formatVector(vectors?.face?.direction)}
          </output>
        </Hint>
        <Hint label="Wearer's right eye: X, Y pupil/iris displacement divided by eye width. An unavailable pupil is never replaced by the other eye.">
          <span className="text-[#ffc078]">R</span>
          <output
            className="font-mono tabular-nums"
            aria-label="Right eye movement vector"
          >
            {formatVector(vectors?.rightEye?.camera)}
          </output>
        </Hint>
        <Hint label="Wearer's left eye: X, Y pupil/iris displacement divided by eye width. These anatomical labels remain the same in a mirrored preview.">
          <span className="text-[#ff8d9a]">L</span>
          <output
            className="font-mono tabular-nums"
            aria-label="Left eye movement vector"
          >
            {formatVector(vectors?.leftEye?.camera)}
          </output>
        </Hint>
      </div>
      <Hint className="mt-2 flex-wrap" label={correctionHint}>
        <span>{correctionLabel}</span>
        <output
          className="font-mono tabular-nums"
          aria-label={
            jointMotion
              ? "Gaze with joint head compensation"
              : "Gaze before and after head correction"
          }
        >
          {!jointMotion && <>{formatVector(beforeHeadCorrection)} → </>}
          {formatVector(afterHeadCorrection)}
        </output>
      </Hint>
    </div>
  )
}
