import { describe, expect, test } from "bun:test"
import {
  imagePoint,
  selectByPoint,
  SelectionController,
} from "../../apps/web/src/features/speaker-focus/selection"
import type { GazeEvidence } from "../../apps/web/src/features/speaker-focus/selection.types"
import type { FaceTrack } from "../../apps/web/src/features/speaker-focus/client.types"

const tracks: FaceTrack[] = [
  {
    id: "left",
    manual: false,
    observations: [{ timestamp: 1, box: [0.1, 0.1, 0.2, 0.5] }],
  },
  {
    id: "right",
    manual: false,
    observations: [{ timestamp: 1, box: [0.7, 0.1, 0.2, 0.5] }],
  },
]
function gaze(now: number, x = 0.2, generation = 1): GazeEvidence {
  return {
    sourceGeneration: generation,
    mediaTime: 1,
    measurement: {
      timestamp: now,
      eyeId: 1,
      sceneId: 1,
      eyeTimestamp: now,
      sceneTimestamp: now,
      confidence: 0.9,
      position: [x, 0.3],
      pixels: null,
      valid: true,
      reason: "verified",
      extrapolated: false,
    },
  }
}

describe("image coordinate selection", () => {
  test("ignores letterboxing and converts contained image coordinates", () => {
    const bounds = { left: 0, top: 0, width: 400, height: 400 }
    expect(imagePoint([200, 20], bounds, 320, 180)).toBeNull()
    expect(imagePoint([80, 155], bounds, 320, 180)).toEqual([0.2, 0.3])
  })
  test("already oriented image and gaze share the same coordinates", () => {
    const corrected = [
      {
        ...tracks[0]!,
        observations: [{ timestamp: 1, box: [0.7, 0.1, 0.2, 0.5] as const }],
      },
    ]
    expect(selectByPoint(corrected, [0.8, 0.3], 1)).toBe("left")
    expect(selectByPoint(corrected, [0.2, 0.3], 1)).toBeNull()
  })
  test("click selects one visible face; expired boxes cannot be selected", () => {
    expect(selectByPoint(tracks, [0.2, 0.3], 1)).toBe("left")
    expect(selectByPoint(tracks, [0.2, 0.3], 1.5)).toBeNull()
    expect(selectByPoint(tracks, [-0.1, 0.3], 1)).toBeNull()
  })
  test("ambiguous boxes never select the largest person", () => {
    expect(
      selectByPoint([tracks[0]!, { ...tracks[0]!, id: "other" }], [0.2, 0.3], 1)
    ).toBeNull()
  })
})

describe("verified gaze dwell", () => {
  test("requires 500 milliseconds with fresh evidence", () => {
    const controller = new SelectionController()
    expect(controller.observeGaze(gaze(100), tracks, 100).selectedId).toBeNull()
    for (const time of [200, 300, 400, 500]) {
      controller.observeGaze(gaze(time), tracks, time)
    }
    expect(controller.observeGaze(gaze(599), tracks, 599).selectedId).toBeNull()
    expect(controller.observeGaze(gaze(600), tracks, 600).selectedId).toBe(
      "left"
    )
  })
  test.each(["estimated", "preview", "extrapolated"] as const)(
    "rejects %s targeting",
    (flag) => {
      const controller = new SelectionController()
      const evidence = gaze(100)
      evidence.measurement[flag] = true
      controller.observeGaze(evidence, tracks, 100)
      evidence.measurement.timestamp = 700
      evidence.measurement.eyeTimestamp = 700
      evidence.measurement.sceneTimestamp = 700
      expect(
        controller.observeGaze(evidence, tracks, 700).selectedId
      ).toBeNull()
    }
  )
  test("150 ms stale evidence resets dwell", () => {
    const controller = new SelectionController()
    controller.observeGaze(gaze(100), tracks, 100)
    expect(controller.observeGaze(gaze(100), tracks, 251).pending).toBeNull()
    expect(controller.observeGaze(gaze(800), tracks, 800).selectedId).toBeNull()
  })
  test("hysteresis retains selected person near the edge", () => {
    const controller = new SelectionController()
    controller.click(tracks, [0.2, 0.3], 1)
    expect(
      controller.observeGaze(gaze(100, 0.31), tracks, 100).selectedId
    ).toBe("left")
    expect(controller.state.pending).toBeNull()
  })
  test("source generation change invalidates old selection and dwell", () => {
    const controller = new SelectionController()
    controller.click(tracks, [0.2, 0.3], 1)
    const generation = controller.state.generation
    expect(
      controller.observeGaze(gaze(100, 0.8, 2), tracks, 100).selectedId
    ).toBeNull()
    expect(controller.state.generation).toBeGreaterThan(generation)
  })
  test("lost target pauses instead of switching to remaining face", () => {
    const controller = new SelectionController()
    controller.click(tracks, [0.2, 0.3], 1)
    const generation = controller.state.generation
    const state = controller.observeGaze(gaze(100), [tracks[1]!], 100)
    expect(state.selectedId).toBe("left")
    expect(state.paused).toBe(true)
    expect(state.generation).toBeGreaterThan(generation)
  })
  test("clear rejects late results through a new selection generation", () => {
    const controller = new SelectionController()
    controller.click(tracks, [0.2, 0.3], 1)
    const generation = controller.state.generation
    controller.clear()
    expect(controller.state.selectedId).toBeNull()
    expect(controller.state.generation).toBeGreaterThan(generation)
  })
})

test("nonfinite or low confidence cannot complete a dwell", () => {
  for (const confidence of [Infinity, NaN, 0.1]) {
    const controller = new SelectionController()
    for (const time of [0, 100, 200, 300, 400, 500, 600]) {
      const evidence = gaze(time)
      evidence.measurement.confidence = confidence
      controller.observeGaze(evidence, tracks, time)
    }
    expect(controller.state.selectedId).toBeNull()
  }
})

test("a long observation gap requires a new continuous dwell", () => {
  const controller = new SelectionController()
  controller.observeGaze(gaze(0), tracks, 0)
  expect(controller.observeGaze(gaze(600), tracks, 600).selectedId).toBeNull()
})
