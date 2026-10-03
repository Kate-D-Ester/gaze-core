import { expect, test } from "bun:test"
import {
  createVisualSelection,
  isSelectionCurrent,
  pruneVisualSelections,
} from "../../apps/web/src/features/camera-viewer/selection"
import { liveSnapshot } from "./fixtures"

test("static selection accepts image edges and rejects missing, stale or invalid image points", () => {
  const state = liveSnapshot()
  expect(createVisualSelection([0, 1], state, 1000)?.point).toEqual([0, 1])
  for (const point of [
    [-0.1, 0.5],
    [0.5, 1.1],
    [NaN, 0.5],
  ] as const) {
    expect(createVisualSelection(point, state, 1000)).toBeNull()
  }
  expect(createVisualSelection([0.5, 0.5], state, 2001)).toBeNull()
  expect(createVisualSelection([0.5, 0.5], state, 999)).toBeNull()
  expect(
    createVisualSelection([0.5, 0.5], { ...state, frame: null }, 1000)
  ).toBeNull()
})

test("a static marker is invalidated by orientation, source, or connection changes", () => {
  const state = liveSnapshot()
  const selected = createVisualSelection([0.2, 0.8], state, 1000)!
  expect(isSelectionCurrent(selected, state, 1100)).toBe(true)
  expect(
    isSelectionCurrent(
      selected,
      { ...state, frame: { ...state.frame!, generation: 2 } },
      1100
    )
  ).toBe(false)
  expect(
    isSelectionCurrent(
      selected,
      { ...state, source: { ...state.source!, key: "replacement" } },
      1100
    )
  ).toBe(false)
  expect(
    isSelectionCurrent(selected, { ...state, connection: "reconnecting" }, 1100)
  ).toBe(false)
  expect(isSelectionCurrent(selected, state, 2100)).toBe(false)
})

test("discarded stale visual selections do not reappear when the same USB feed resumes", () => {
  const state = liveSnapshot()
  const selection = createVisualSelection([0.2, 0.8], state, 1000)!
  const pending = { scene: selection }
  const states = { eye: state, scene: state, auxiliary: state }
  const discarded = pruneVisualSelections(pending, states, 2100)
  expect(discarded.scene).toBeUndefined()
  const resumed = {
    ...state,
    frame: { ...state.frame!, id: 2, timestamp: 2200 },
  }
  expect(
    pruneVisualSelections(discarded, { ...states, scene: resumed }, 2200).scene
  ).toBeUndefined()
})
