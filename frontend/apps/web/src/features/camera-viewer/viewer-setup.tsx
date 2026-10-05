import type { ViewerSetupProps } from "./viewer-setup.types"
import { EyeButtonStyles } from "../tracking-ui/control-styles"

export function ViewerSetup({ onSetup, status, disabled }: ViewerSetupProps) {
  return (
    <div className="flex items-center gap-3">
      {status && (
        <span role="status" className="text-xs text-muted-foreground">
          {status}
        </span>
      )}
      <button
        type="button"
        onClick={onSetup}
        disabled={disabled}
        className={`secondary ${EyeButtonStyles}`}
      >
        Gaze setup
      </button>
      <details className="relative text-xs">
        <summary className="cursor-pointer rounded px-2 py-2 text-muted-foreground">
          Help
        </summary>
        <div className="absolute top-full right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border bg-card p-4 shadow-lg">
          <ol className="list-decimal space-y-2 pl-4">
            <li>Connect a USB device or network stream.</li>
            <li>Use Orientation to rotate or mirror the image.</li>
            <li>
              Click an object in Scene, or use calibrated gaze and Select.
            </li>
          </ol>
          <div className="mt-3 flex gap-3 text-primary">
            <a
              href="#eye-camera-panel"
              className="underline underline-offset-4"
            >
              Eye
            </a>
            <a
              href="#scene-camera-panel"
              className="underline underline-offset-4"
            >
              Scene
            </a>
            <a
              href="#auxiliary-camera-panel"
              className="underline underline-offset-4"
            >
              Target
            </a>
          </div>
          <p className="mt-3 text-muted-foreground">
            Gaze setup configures the eye tracker and scene calibration. Use in
            viewer keeps that session connected.
          </p>
        </div>
      </details>
    </div>
  )
}
