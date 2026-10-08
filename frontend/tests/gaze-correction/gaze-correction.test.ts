import { describe, expect, test } from "bun:test"
import {
  correctionTarget,
  GazeCorrectionSampler,
} from "../../apps/web/src/features/gaze-correction/gaze-correction"
import type { Point } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"

function hold(sampler: GazeCorrectionSampler, point: Point, start = 0) {
  for (let time = start; time <= start + 200; time += 40) {
    sampler.add(point, time)
  }
}

describe("click correction", () => {
  test("updates both axes from actual gaze and composes repeated corrections", () => {
    const sampler = new GazeCorrectionSampler()
    hold(sampler, [0.4, 0.6])
    const first = sampler.correct([0.5, 0.5], [0, 0], 200)
    expect(first.offset![0]).toBeCloseTo(0.1)
    expect(first.offset![1]).toBeCloseTo(-0.1)
    sampler.clear()
    hold(sampler, [0.55, 0.48], 400)
    const second = sampler.correct([0.5, 0.5], first.offset!, 600)
    expect(second.offset![0]).toBeCloseTo(0.05)
    expect(second.offset![1]).toBeCloseTo(-0.08)
  })
  test("can recover gaze outside the viewport without clamping its measurement", () => {
    const sampler = new GazeCorrectionSampler()
    hold(sampler, [1.15, -0.2])
    expect(sampler.correct([0.8, 0.2], [0, 0], 200).offset).toEqual([
      -0.34999999999999987, 0.4,
    ])
  })
  test("rejects stale, duplicate, future, blinking and moving measurements", () => {
    const sampler = new GazeCorrectionSampler()
    hold(sampler, [0.4, 0.6])
    expect(sampler.correct([0.5, 0.5], [0, 0], 600).offset).toBeNull()
    expect(sampler.correct([0.5, 0.5], [0, 0], 100).offset).toBeNull()
    sampler.clear()
    for (let i = 0; i < 10; i++) {
      sampler.add([0.4, 0.6], 200)
    }
    expect(sampler.correct([0.5, 0.5], [0, 0], 200).offset).toBeNull()
    sampler.clear()
    hold(sampler, [0.4, 0.6])
    sampler.add(null, null)
    expect(sampler.correct([0.5, 0.5], [0, 0], 200).offset).toBeNull()
    for (let i = 0; i < 6; i++) {
      sampler.add([i / 10, 0.5], 1000 + i * 40)
    }
    expect(sampler.correct([0.5, 0.5], [0, 0], 1200).offset).toBeNull()
  })
  test("honors deliberate scene alignment delay without refreshing frozen frames", () => {
    const sampler = new GazeCorrectionSampler()
    hold(sampler, [0.4, 0.6], 1000)
    expect(sampler.correct([0.5, 0.5], [0, 0], 1700).offset).toBeNull()
    expect(
      sampler.correct([0.5, 0.5], [0, 0], 1700, 680).offset![0]
    ).toBeCloseTo(0.1)
    // Repaints of the same frame cannot extend freshness.
    sampler.add([0.4, 0.6], 1200)
    expect(sampler.correct([0.5, 0.5], [0, 0], 1900, 680).offset).toBeNull()
    expect(
      sampler.correct([0.5, 0.5], [0, 0], 1700, Infinity).offset
    ).toBeNull()
  })
  test("rejects invalid or extreme offsets instead of silently clamping", () => {
    const sampler = new GazeCorrectionSampler()
    hold(sampler, [2, 0.5])
    expect(sampler.correct([0.5, 0.5], [0, 0], 200).offset).toBeNull()
    expect(sampler.correct([NaN, 0.5], [0, 0], 200).offset).toBeNull()
  })
  test("uses the actual scene image rectangle and excludes letterboxing", () => {
    const bounds = { left: 20, top: 80, width: 800, height: 400 }
    expect(
      correctionTarget([420, 280], bounds, { width: 600, height: 800 })
    ).toEqual([0.5, 0.5])
    expect(
      correctionTarget([30, 280], bounds, { width: 600, height: 800 })
    ).toBeNull()
    // A rotated source already has swapped dimensions; do not mirror/rotate again.
    expect(
      correctionTarget([220, 280], bounds, { width: 800, height: 600 })![0]
    ).toBeCloseTo(0.125)
    expect(
      correctionTarget([400, 200], { left: 0, top: 0, width: 800, height: 400 })
    ).toEqual([0.5, 0.5])
  })
})
