import { useEffect, useRef } from "react"
import type { CalibrationTargetProps } from "./calibration-target.types"

export function CalibrationTarget({
  progress,
  bursting,
}: CalibrationTargetProps) {
  const pill = useRef<HTMLSpanElement | null>(null)
  const currentProgress = useRef(0)
  useEffect(() => {
    currentProgress.current = progress
  }, [progress])
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let angle = 0
    let previous = performance.now()
    let animation = 0
    function rotate(now: number): void {
      const elapsed = Math.min(0.05, (now - previous) / 1000)
      const speed = 45 + 1200 * currentProgress.current ** 2
      angle = (angle + elapsed * speed) % 360
      previous = now
      if (pill.current) pill.current.style.transform = `rotate(${angle}deg)`
      animation = requestAnimationFrame(rotate)
    }
    animation = requestAnimationFrame(rotate)
    return () => cancelAnimationFrame(animation)
  }, [])
  const hue = 55 - progress * 50
  let color = "#ccd2ce"
  if (progress > 0)
    color = `hsl(${hue} ${35 + progress * 65}% ${70 - progress * 20}%)`
  return (
    <span
      className={`eye-calibration-stimulus ${bursting ? "is-bursting" : ""}`}
      aria-hidden="true"
    >
      <span
        ref={pill}
        className="eye-calibration-pill"
        style={{ backgroundColor: color }}
      />
      <span className="eye-calibration-focal-point" />
    </span>
  )
}
