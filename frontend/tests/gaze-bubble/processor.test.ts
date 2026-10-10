import { expect, test } from "bun:test"
import {
  GazeBubbleProcessor,
  getGazeView,
} from "../../apps/web/src/features/gaze-bubble/gaze-bubble"
import type { GazeBubbleOptions } from "../../apps/web/src/features/gaze-bubble/gaze-bubble.types"

const desktop: GazeBubbleOptions = {
  width: 1200,
  height: 800,
  errorRadiusPx: 12,
  verified: true,
  stabilize: true,
}
const sample = (x: number, y: number, timestamp: number) => ({
  point: [x / 1200, y / 800] as [number, number],
  timestamp,
})
function settled(options = desktop) {
  const processor = new GazeBubbleProcessor()
  for (let t = 0; t <= 160; t += 40)
    processor.update(sample(600 + (t % 80 ? 2 : -2), 400, t), options, t)
  return processor
}

test("large measured error never makes a desktop bubble exceed 300px and remains flagged", () => {
  const result = new GazeBubbleProcessor().update(
    sample(600, 400, 0),
    { ...desktop, errorRadiusPx: 300 },
    0
  )!
  expect(result.radiusPx).toBe(150)
  expect(result.limited).toBe(true)
  expect(result.errorRadiusPx).toBe(300)
})

test("a 76px error gets a 152px bubble and only errors above the 150px radius hit the desktop limit", () => {
  for (const errorRadiusPx of [76, 150, 151]) {
    const result = new GazeBubbleProcessor().update(
      sample(600, 400, 0),
      { ...desktop, errorRadiusPx },
      0
    )!
    expect(result.radiusPx * 2).toBe(Math.min(errorRadiusPx * 2, 300))
    expect(result.limited).toBe(errorRadiusPx > 150)
  }
})

test("small and tiny views limit the diameter to half of the short edge", () => {
  for (const [width, height, maxRadius] of [
    [390, 844, 97.5],
    [240, 180, 45],
    [10, 20, 2.5],
  ]) {
    const result = new GazeBubbleProcessor().update(
      { point: [0.5, 0.5], timestamp: 0 },
      { ...desktop, width, height, errorRadiusPx: 100 },
      0
    )!
    expect(result.radiusPx).toBeCloseTo(maxRadius, 8)
    expect(result.limited).toBe(true)
  }
})

test("missing or invalid error cannot masquerade as measured confidence", () => {
  for (const errorRadiusPx of [null, NaN, -2]) {
    const result = new GazeBubbleProcessor().update(
      sample(600, 400, 0),
      { ...desktop, errorRadiusPx },
      0
    )!
    expect(result.radiusPx).toBe(14)
    expect(result.verified).toBe(false)
  }
  const failed = new GazeBubbleProcessor().update(
    sample(600, 400, 0),
    { ...desktop, errorRadiusPx: Infinity },
    0
  )!
  expect(failed.limited).toBe(true)
  expect(failed.radiusPx).toBe(150)
  expect(failed.verified).toBe(false)
})

test("a fixation holds its center while fresh samples move within it", () => {
  const processor = settled()
  const anchor = processor.update(sample(601, 399, 200), desktop, 200)!
  expect(anchor.motion).toBe("stable")
  for (let t = 240; t <= 600; t += 40) {
    const next = processor.update(
      sample(t % 80 ? 603 : 597, 402, t),
      desktop,
      t
    )!
    expect(next.center).toEqual(anchor.center)
    expect(next.rawPoint).toEqual(sample(t % 80 ? 603 : 597, 402, t).point)
  }
})

test("one isolated spike does not move the anchor, but a genuine gaze shift releases it", () => {
  const processor = settled()
  const anchor = processor.update(sample(600, 400, 200), desktop, 200)!
  expect(processor.update(sample(900, 650, 240), desktop, 240)!.center).toEqual(
    anchor.center
  )
  expect(processor.update(sample(600, 400, 280), desktop, 280)!.center).toEqual(
    anchor.center
  )
  processor.update(sample(900, 650, 320), desktop, 320)
  const moved = processor.update(sample(902, 648, 360), desktop, 360)!
  expect(moved.center[0]).toBeGreaterThan(0.74)
  expect(moved.motion).toBe("moving")
})

test.each([67, 100, 150])(
  "lower-rate cameras establish stable fixations at %d ms intervals",
  (interval) => {
    const processor = new GazeBubbleProcessor()
    let result
    for (let i = 0; i < 5; i++) {
      result = processor.update(
        sample(600 + (i % 2 ? 2 : -2), 400, i * interval),
        desktop,
        i * interval
      )
    }
    expect(result!.motion).toBe("stable")
    const anchor = result!.center
    expect(
      processor.update(sample(603, 401, 5 * interval), desktop, 5 * interval)!
        .center
    ).toEqual(anchor)
    processor.update(sample(900, 400, 6 * interval), desktop, 6 * interval)
    expect(
      processor.update(sample(902, 400, 7 * interval), desktop, 7 * interval)!
        .center[0]
    ).toBeGreaterThan(0.74)
  }
)

test("large error estimates cannot turn the movement deadband into a giant sticky region", () => {
  const options = { ...desktop, errorRadiusPx: 200 }
  const processor = settled(options)
  processor.update(sample(625, 400, 200), options, 200)
  const result = processor.update(sample(626, 400, 240), options, 240)!
  expect(result.center[0] * 1200).toBeGreaterThan(620)
})

test.each([
  [40, 130],
  [50, 130],
  [40, 150],
])(
  "uneven camera intervals of %d/%d ms still establish a fixation",
  (short, long) => {
    const processor = new GazeBubbleProcessor()
    let timestamp = 0
    let result
    for (let i = 0; i < 8; i++) {
      timestamp += i % 2 ? long : short
      result = processor.update(
        sample(600 + (i % 2 ? 2 : -2), 400, timestamp),
        desktop,
        timestamp
      )
    }
    expect(result!.motion).toBe("stable")
    expect(result!.center[0]).toBeCloseTo(0.5, 2)
  }
)

test("slow deliberate movement eventually releases instead of remaining locked forever", () => {
  const processor = settled()
  let result
  for (let i = 1; i <= 20; i++)
    result = processor.update(
      sample(600 + i * 2, 400, 160 + i * 40),
      desktop,
      160 + i * 40
    )
  expect(result!.center[0] * 1200).toBeGreaterThan(628)
})

test("scene mode follows gradual motion without acquiring a pixel lock", () => {
  const processor = new GazeBubbleProcessor()
  const options = { ...desktop, stabilize: false }
  for (let i = 0; i < 20; i++) {
    const result = processor.update(
      sample(600 + i * 2, 400, i * 40),
      options,
      i * 40
    )!
    expect(result.motion).toBe("moving")
    expect(Math.abs(result.center[0] * 1200 - (600 + i * 2))).toBeLessThan(5)
  }
})

test("repainting the same source sample does not establish a fixation or refresh freshness", () => {
  const processor = new GazeBubbleProcessor()
  const input = sample(600, 400, 0)
  processor.update(input, desktop, 0)
  for (const now of [40, 80, 120, 160, 200])
    expect(processor.update(input, desktop, now)!.motion).toBe("moving")
  expect(processor.update(input, desktop, 351)).toBeNull()
  expect(processor.update(sample(900, 400, 400), desktop, 400)!.center).toEqual(
    [0.75, 0.5]
  )
})

test("invalid, future and lost data hide the bubble and clear its anchor", () => {
  for (const input of [
    null,
    { point: [NaN, 0.5], timestamp: 200 },
    { point: [0.5, 0.5], timestamp: 500 },
  ]) {
    const processor = settled()
    expect(processor.update(input as any, desktop, 200)).toBeNull()
    expect(
      processor.update(sample(900, 400, 240), desktop, 240)!.center
    ).toEqual([0.75, 0.5])
  }
})

test("resize, explicit reset and long observation gaps drop the old anchor", () => {
  const processor = settled()
  const changed = { ...desktop, width: 600, height: 400 }
  expect(
    processor.update({ point: [0.8, 0.2], timestamp: 200 }, changed, 200)!
      .center
  ).toEqual([0.8, 0.2])
  processor.reset()
  expect(processor.update(sample(900, 400, 240), desktop, 240)!.center).toEqual(
    [0.75, 0.5]
  )
  expect(processor.update(sample(300, 200, 700), desktop, 700)!.center).toEqual(
    [0.25, 0.25]
  )
})

test("display processing never mutates the measured point", () => {
  const processor = settled()
  const input = Object.freeze({
    point: Object.freeze([0.75, 0.5]) as unknown as [number, number],
    timestamp: 200,
  })
  const result = processor.update(input, desktop, 200)!
  expect(input.point).toEqual([0.75, 0.5])
  expect(result.center).not.toEqual(input.point)
})

test("contained scene geometry uses the image area and scales native error into CSS pixels", () => {
  expect(getGazeView(800, 800, { width: 1920, height: 1080 })).toEqual({
    width: 800,
    height: 450,
    left: 0,
    top: 175,
    scale: 800 / 1920,
  })
  expect(getGazeView(390, 844)).toEqual({
    width: 390,
    height: 844,
    left: 0,
    top: 0,
    scale: 1,
  })
  expect(getGazeView(0, 800)).toBeNull()
  expect(getGazeView(800, 800, { width: 0, height: 1080 })).toBeNull()
})

test("scene expiry respects its stricter freshness limit and configured camera delay", () => {
  const processor = new GazeBubbleProcessor()
  expect(
    processor.update(sample(600, 400, 0), { ...desktop, maxAgeMs: 250 }, 251)
  ).toBeNull()
  expect(
    processor.update(sample(600, 400, 0), { ...desktop, maxAgeMs: 750 }, 500)
  ).not.toBeNull()
})
