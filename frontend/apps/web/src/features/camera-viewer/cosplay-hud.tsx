import type { CosplayHudProps } from "./cosplay-hud.types"

const CORNERS = "M5 18V5H18 M46 5H59V18 M59 46V59H46 M18 59H5V46"

/** Decorative cosplay effects; no detection, matching, or hardware outputs. */
export function CosplayHud({ label, selection }: CosplayHudProps) {
  return (
    <span
      role="group"
      aria-label={`${label} cosplay simulation`}
      className="pointer-events-none absolute inset-0 text-cyan-300"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <path d={CORNERS} vectorEffect="non-scaling-stroke" opacity="0.5" />
        {!selection && (
          <line
            x1="10"
            y1="8"
            x2="54"
            y2="8"
            vectorEffect="non-scaling-stroke"
            opacity="0.35"
            className="motion-reduce:hidden"
          >
            <animate
              attributeName="y1"
              values="8;56;8"
              dur="4s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="y2"
              values="8;56;8"
              dur="4s"
              repeatCount="indefinite"
            />
          </line>
        )}
      </svg>
      {selection && (
        <svg
          role="img"
          aria-label={`${label} simulated manual lock`}
          viewBox="0 0 64 64"
          className="absolute size-16 -translate-x-1/2 -translate-y-1/2 motion-safe:animate-pulse"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{
            left: `${selection.point[0] * 100}%`,
            top: `${selection.point[1] * 100}%`,
          }}
        >
          <path d={CORNERS} />
        </svg>
      )}
      <span
        role="status"
        aria-live="polite"
        className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[10px]"
      >
        Simulation · {selection ? "Locked point" : "Scanning"}
      </span>
    </span>
  )
}
