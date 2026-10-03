import { describe, expect, test } from "bun:test"
import {
  imagePoint,
  verifiedGazePoint,
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
    bubble: { center: [x, 0.3], radius: [0.015, 0.025], timestamp: now },
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

test("checking a video frame pauses a lost target without requiring gaze input", () => {
  const controller = new SelectionController()
  controller.click(tracks, [0.2, 0.3], 1)
  expect(controller.checkTracks(tracks, 2).paused).toBe(true)
  expect(controller.state.selectedId).toBe("left")
})

test("displayed speaker gaze accepts only fresh measured coordinates", () => {
  const measurement = gaze(100).measurement
  expect(verifiedGazePoint(measurement, 100)).toEqual([0.2, 0.3])
  for (const now of [99, 251, NaN]) {
    expect(verifiedGazePoint(measurement, now)).toBeNull()
  }
  for (const flag of ["estimated", "preview", "extrapolated"] as const) {
    expect(verifiedGazePoint({ ...measurement, [flag]: true }, 100)).toBeNull()
  }
  expect(
    verifiedGazePoint({ ...measurement, eyeTimestamp: null }, 100)
  ).toBeNull()
  expect(verifiedGazePoint({ ...measurement, confidence: 0.4 }, 100)).toBeNull()
  expect(
    verifiedGazePoint({ ...measurement, position: [Infinity, 0.3] }, 100)
  ).toBeNull()
})

test("a selected person stays locked while gaze moves to objects or eye tracking drops", () => {
  const controller = new SelectionController()
  controller.click(tracks, [0.2, 0.3], 1)
  const generation = controller.state.generation
  for (let now = 100; now <= 2000; now += 100) {
    const evidence = gaze(now, 0.5)
    controller.observeGaze(evidence, tracks, now)
  }
  const missing = gaze(2100, 0.5)
  missing.measurement.valid = false
  missing.measurement.position = null
  controller.observeGaze(missing, tracks, 2100)
  expect(controller.state.selectedId).toBe("left")
  expect(controller.state.paused).toBe(false)
  expect(controller.state.generation).toBe(generation)
})

test("only a continuous dwell on a different visible person switches the lock", () => {
  const controller = new SelectionController()
  controller.click(tracks, [0.2, 0.3], 1)
  for (const now of [100, 200, 300]) {
    controller.observeGaze(gaze(now, 0.8), tracks, now)
  }
  controller.observeGaze(gaze(400, 0.5), tracks, 400)
  for (const now of [500, 600, 700, 800, 900, 999]) {
    expect(controller.observeGaze(gaze(now, 0.8), tracks, now).selectedId).toBe(
      "left"
    )
  }
  expect(controller.observeGaze(gaze(1000, 0.8), tracks, 1000).selectedId).toBe(
    "right"
  )
})

test("the locked person leaving pauses audio instead of selecting another visible person", () => {
  const controller = new SelectionController()
  controller.click(tracks, [0.2, 0.3], 1)
  const generation = controller.state.generation
  const state = controller.observeGaze(gaze(100, 0.5), [tracks[1]!], 100)
  expect(state.paused).toBe(true)
  expect(state.generation).toBeGreaterThan(generation)
  expect(state.reason).toContain("Selected face was lost")
  for (let now = 200; now <= 1000; now += 100) {
    controller.observeGaze(gaze(now, 0.5), [tracks[1]!], now)
  }
  expect(controller.state.selectedId).not.toBe("right")
  expect(controller.state.paused).toBe(true)
})
