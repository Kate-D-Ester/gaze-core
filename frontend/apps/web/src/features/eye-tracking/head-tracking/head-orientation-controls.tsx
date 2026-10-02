import {
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
  Undo2,
} from "lucide-react"
import { EyeActionButton } from "../components/eye-action-button"
import {
  DEFAULT_HEAD_CAMERA_TRANSFORM,
  normalizeHeadCameraTransform,
} from "./head-camera-transform"
import type { HeadOrientationControlsProps } from "./head-orientation-controls.types"

export function HeadOrientationControls({
  value,
  onChange,
}: HeadOrientationControlsProps) {
  function rotate(degrees: number): void {
    onChange(
      normalizeHeadCameraTransform({
        ...value,
        rotation: value.rotation + degrees,
      })
    )
  }

  return (
    <div
      className="eye-action-row eye-head-orientation"
      role="group"
      aria-label="Front camera orientation"
    >
      <EyeActionButton
        label="Rotate front camera counterclockwise"
        onClick={() => rotate(-90)}
      >
        <RotateCcw size={16} aria-hidden="true" />
      </EyeActionButton>
      <EyeActionButton
        label="Rotate front camera clockwise"
        onClick={() => rotate(90)}
      >
        <RotateCw size={16} aria-hidden="true" />
      </EyeActionButton>
      <EyeActionButton
        label="Mirror front camera input"
        aria-pressed={value.mirrorX}
        onClick={() => onChange({ ...value, mirrorX: !value.mirrorX })}
      >
        <FlipHorizontal2 size={16} aria-hidden="true" />
      </EyeActionButton>
      <EyeActionButton
        label="Flip front camera input vertically"
        aria-pressed={value.mirrorY}
        onClick={() => onChange({ ...value, mirrorY: !value.mirrorY })}
      >
        <FlipVertical2 size={16} aria-hidden="true" />
      </EyeActionButton>
      <EyeActionButton
        label="Reset front camera orientation"
        onClick={() => onChange({ ...DEFAULT_HEAD_CAMERA_TRANSFORM })}
      >
        <Undo2 size={16} aria-hidden="true" />
      </EyeActionButton>
    </div>
  )
}
