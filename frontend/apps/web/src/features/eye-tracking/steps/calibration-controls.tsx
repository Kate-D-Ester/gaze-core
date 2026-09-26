import { Crosshair } from "lucide-react"

export function CalibrationControls({
  usable,
  locked,
  onStart,
}: {
  usable: boolean
  locked: boolean
  onStart: () => void
}) {
  return (
    <>
      <div className="eye-calibration-illustration" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <h3>Nine points. One clear mapping.</h3>
      <p className="eye-muted">
        Keep your head and camera still. Look at each dot until it fills. Valid
        frames are captured automatically.
      </p>
      <button
        className="eye-button primary"
        disabled={!usable || !locked}
        onClick={onStart}
      >
        Start calibration
        <Crosshair size={17} />
      </button>
      <p className="eye-small">
        Usually 20–30 seconds. Recalibrate after moving the camera or resizing
        this window.
      </p>
    </>
  )
}
