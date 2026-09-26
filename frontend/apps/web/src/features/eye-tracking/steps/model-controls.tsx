import { ChevronDown, RotateCcw } from "lucide-react"
import { SpherePreview } from "../preview"
import type { FrameSettings, Point } from "../types"
import type { TrackerController } from "../use-tracker"

export function ModelControls({
  tracker,
  corner,
  update,
  setNotice,
}: {
  tracker: TrackerController
  corner: Point | null
  update: (next: Partial<FrameSettings>) => void
  setNotice: (message: string) => void
}) {
  const { settings, frame } = tracker
  return (
    <>
      <SpherePreview frame={frame} />
      {settings.format === "classic" ? (
        <>
          <h3>
            {corner
              ? "Now select the other corner."
              : "Select the two eye corners."}
          </h3>
          <p className="eye-muted">
            Click the inner and outer corners in the preview.
          </p>
          <div className="eye-number-grid">
            {[0, 1].map((i) => (
              <label className="eye-field" key={i}>
                Corner {i + 1} · x
                <input
                  type="number"
                  value={settings.corners?.[i][0] ?? (i === 0 ? 180 : 460)}
                  onChange={(e) => {
                    const corners: [Point, Point] = settings.corners
                      ? [[...settings.corners[0]], [...settings.corners[1]]]
                      : [
                          [180, 240],
                          [460, 240],
                        ]
                    corners[i][0] = Number(e.target.value)
                    update({ corners })
                  }}
                />
              </label>
            ))}
          </div>
          <button
            className="eye-text-button"
            onClick={() =>
              update({
                corners: [
                  [
                    settings.roi.x + settings.roi.width * 0.15,
                    settings.roi.y + settings.roi.height * 0.5,
                  ],
                  [
                    settings.roi.x + settings.roi.width * 0.85,
                    settings.roi.y + settings.roi.height * 0.5,
                  ],
                ],
              })
            }
          >
            Use region-based starting corners
          </button>
        </>
      ) : (
        <>
          <h3>
            {frame?.model?.ready ? "Ready to lock." : "Look around slowly."}
          </h3>
          <p className="eye-muted">
            Look toward each edge. Lock when the sphere is stable.
          </p>
          <div className="eye-progress-track">
            <i
              style={{
                width: `${Math.min(100, ((frame?.model?.samples ?? 0) / 30) * 100)}%`,
              }}
            />
          </div>
        </>
      )}
      <button
        className="eye-button secondary"
        onClick={() => {
          update({ locked: false })
          setNotice("Look around to rebuild.")
        }}
      >
        <RotateCcw size={15} />
        Rebuild model
      </button>
      {settings.format === "spatial" && (
        <details className="eye-details">
          <summary>
            Camera geometry
            <ChevronDown size={14} />
          </summary>
          <label className="eye-field">
            Vertical field of view · degrees
            <input
              type="number"
              min="10"
              max="140"
              value={settings.fov}
              onChange={(e) => {
                const fov = Number(e.target.value)
                if (fov >= 10 && fov <= 140) update({ fov })
              }}
            />
          </label>
          <label className="eye-field">
            Assumed eye radius · mm
            <input
              type="number"
              min="8"
              max="16"
              step="0.1"
              value={settings.radiusMm}
              onChange={(e) => {
                const radiusMm = Number(e.target.value)
                if (radiusMm >= 8 && radiusMm <= 16) update({ radiusMm })
              }}
            />
          </label>
          <p className="eye-small">
            45° and 12 mm are model assumptions. Use your camera’s measured
            field of view for a better scale estimate.
          </p>
        </details>
      )}
    </>
  )
}
