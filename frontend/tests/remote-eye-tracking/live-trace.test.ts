import { expect, test } from "bun:test"
import { RemoteLiveTrace } from "../../apps/web/src/features/remote-eye-tracking/live-trace"
import type { RemoteLiveTraceEntry } from "../../apps/web/src/features/remote-eye-tracking/live-trace.types"

function reading(timestamp: number): RemoteLiveTraceEntry {
  return {
    observation: {
      timestamp,
      width: 640,
      height: 480,
      feature: [0.02, -0.01],
      pose: {
        kind: "face",
        yaw: 0,
        pitch: 0,
        roll: 0,
        x: 0.5,
        y: 0.5,
        scale: 0.2,
      },
      quality: 0.9,
      reason: null,
      eyes: [],
      faceBox: null,
      basePoint: [0.52, 0.49],
      method: "synthetic",
      processingMs: 1,
    },
    mappedPoint: [1.2, -0.1],
    screenPoint: [1.3, -0.2],
  }
}

test("live diagnostics preserve model and screen coordinates outside the viewport", () => {
  const trace = new RemoteLiveTrace()
  const entry = reading(1000)
  trace.record(entry)
  expect(trace.read(1000)).toEqual([entry])
  expect(trace.read(21001)).toEqual([])
  expect(trace.read(999)).toEqual([])
  expect(trace.read(NaN)).toEqual([])
})

test("live diagnostics are bounded and cannot duplicate or refresh a camera frame", () => {
  const trace = new RemoteLiveTrace()
  for (let timestamp = 0; timestamp <= 30000; timestamp += 10) {
    trace.record(reading(timestamp))
  }
  const entries = trace.read(30000)
  expect(entries).toHaveLength(200)
  expect(entries[0]!.observation.timestamp).toBe(10100)
  expect(entries.at(-1)!.observation.timestamp).toBe(30000)
  trace.record(reading(30000))
  trace.record(reading(29900))
  trace.record(reading(NaN))
  expect(trace.read(30000)).toEqual(entries)
})

test("missing live estimates remain explicit diagnostic gaps", () => {
  const trace = new RemoteLiveTrace()
  const entry = reading(1000)
  entry.observation.reason = "blink"
  entry.observation.feature = null
  entry.mappedPoint = null
  entry.screenPoint = null
  trace.record(entry)
  expect(trace.read(1000)[0]).toEqual(entry)
})
