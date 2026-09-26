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
      <h3>9-point calibration</h3>
      <p className="eye-muted">Keep still. Follow each dot until it fills.</p>
      <button
        className="eye-button primary"
        disabled={!usable || !locked}
        onClick={onStart}
      >
        Start calibration
        <Crosshair size={17} />
      </button>
      <p className="eye-small">About 20–30 seconds.</p>
    </>
  )
}
