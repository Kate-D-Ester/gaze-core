import { EyeButtonStyles } from "../tracking-ui/control-styles"

export function ViewerSetup() {
  return (
    <div className="flex items-center gap-3">
      <a
        href="/trial/scene-camera-eye-tracking"
        className={`secondary ${EyeButtonStyles}`}
      >
        Gaze setup
      </a>
      <details className="relative text-xs">
        <summary className="cursor-pointer rounded px-2 py-2 text-muted-foreground">
          Help
        </summary>
        <div className="absolute top-full right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border bg-card p-4 shadow-lg">
          <ol className="list-decimal space-y-2 pl-4">
            <li>Connect a USB device or network stream.</li>
            <li>Use Orientation to rotate or mirror the image.</li>
            <li>Choose a camera, then click its preview or use a command.</li>
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
              Auxiliary
            </a>
          </div>
          <p className="mt-3 text-muted-foreground">
            Eye is a preview here. Gaze setup opens the separate calibration
            trial.
          </p>
        </div>
      </details>
    </div>
  )
}
