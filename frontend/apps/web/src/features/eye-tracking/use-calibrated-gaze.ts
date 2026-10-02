import { useEffect, useState } from "react"
import { getScreenGaze } from "./screen-gaze"
import type { ScreenGazeReading } from "./screen-gaze.types"
import type { UseCalibratedGazeOptions } from "./use-calibrated-gaze.types"
import type { Point } from "./eye-tracking.types"
import { GazeFrameSynchronizer } from "./head-tracking/head-synchronization"
import { synchronizedHeadPose } from "./head-tracking/head-pose"

export function useCalibratedGaze({
  calibration,
  eye,
  head,
  headHistory,
  onDiagnosticReading,
}: UseCalibratedGazeOptions): ScreenGazeReading {
  const [reading, setReading] = useState<ScreenGazeReading>({
    point: null,
    status: "not-calibrated",
    message: "Calibrate your screen first.",
  })
  useEffect(() => {
    const synchronizer = new GazeFrameSynchronizer()
    let filtered: Point | null = null
    let previousTime = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      let frame = eye.current
      let pose = head.current
      if (calibration?.headCompensation && headHistory) {
        const pair = synchronizer.read(frame, headHistory.current, now)
        frame = pair?.eye ?? eye.current
        pose = pair?.head ?? null
      }
      const next = getScreenGaze(calibration, frame, pose, now)
      if (calibration && onDiagnosticReading) {
        onDiagnosticReading({
          mode: "live",
          now,
          eye: frame,
          head: head.current,
          pairedHead: synchronizedHeadPose(pose, frame?.timestamp ?? NaN, now),
          point: next.point,
          status: next.status,
        })
      }
      if (next.status !== "tracking" || !next.point) {
        filtered = null
        setReading((current) => {
          if (
            !current.point &&
            !next.point &&
            current.status === next.status &&
            current.message === next.message
          ) {
            return current
          }
          return next
        })
        previousTime = now
        return
      }
      if (filtered) {
        const elapsed = Math.max(0.001, (now - previousTime) / 1000)
        const distance = Math.hypot(
          next.point[0] - filtered[0],
          next.point[1] - filtered[1]
        )
        const cutoff = 2 + (15 * distance) / elapsed
        const alpha = 1 - Math.exp(-2 * Math.PI * cutoff * elapsed)
        filtered = [
          filtered[0] + alpha * (next.point[0] - filtered[0]),
          filtered[1] + alpha * (next.point[1] - filtered[1]),
        ]
      } else {
        filtered = next.point
      }
      setReading({ ...next, point: filtered })
      previousTime = now
    }, 40)
    return () => clearInterval(timer)
  }, [calibration, eye, head, headHistory, onDiagnosticReading])
  return reading
}
