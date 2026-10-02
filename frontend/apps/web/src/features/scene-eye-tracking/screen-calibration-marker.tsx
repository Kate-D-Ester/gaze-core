import { useState, type CSSProperties } from "react"
import { Minus, Plus } from "lucide-react"
import { markerSvg } from "./marker-detector"

const markerUrl = "data:image/svg+xml," + encodeURIComponent(markerSvg())
export function ScreenCalibrationMarker({ capturing }: { capturing: boolean }) {
  const [size, setSize] = useState(100)
  return (
    <div
      className="screen-marker-stage"
      aria-label="On-screen calibration marker"
    >
      <img
        className="screen-calibration-marker"
        src={markerUrl}
        alt="Calibration marker. Look at the red center."
        style={{ "--marker-scale": size / 100 } as CSSProperties}
        draggable={false}
      />
      <div className="screen-marker-size" role="group" aria-label="Marker size">
        <button
          type="button"
          className="eye-button secondary eye-action-icon"
          aria-label="Smaller marker"
          title="Smaller marker"
          data-tooltip="Smaller marker"
          disabled={capturing || size <= 60}
          onClick={() => setSize((value) => value - 10)}
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="eye-button secondary eye-action-icon"
          aria-label="Larger marker"
          title="Larger marker · easier detection"
          data-tooltip="Larger marker · easier detection"
          disabled={capturing || size >= 100}
          onClick={() => setSize((value) => value + 10)}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
