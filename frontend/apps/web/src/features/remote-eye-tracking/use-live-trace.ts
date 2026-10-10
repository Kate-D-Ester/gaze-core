import { useEffect, useMemo } from "react"
import { RemoteLiveTrace } from "./live-trace"
import type { RemoteLiveTraceOptions } from "./live-trace.types"

/** Changing the mapping or its coordinate context starts a fresh diagnostic window. */
export function useRemoteLiveTrace({
  calibration,
  alignment,
  offset,
  width,
  height,
  enabled,
  observation,
  mappedPoint,
  screenPoint,
}: RemoteLiveTraceOptions) {
  const [offsetX, offsetY] = offset
  const trace = useMemo(
    () => new RemoteLiveTrace(),
    // These dependencies define the coordinate context, not individual frames.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calibration, alignment, offsetX, offsetY, width, height]
  )
  useEffect(() => {
    if (enabled && calibration && observation) {
      trace.record({ observation, mappedPoint, screenPoint })
    }
  }, [trace, enabled, calibration, observation, mappedPoint, screenPoint])
  return trace
}
