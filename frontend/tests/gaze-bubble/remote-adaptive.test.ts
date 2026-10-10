import { expect, test } from "bun:test"
import { GazeBubbleProcessor } from "../../apps/web/src/features/gaze-bubble/gaze-bubble"
import type { GazeBubbleOptions } from "../../apps/web/src/features/gaze-bubble/gaze-bubble.types"

const remote: GazeBubbleOptions & { profile: "remote-adaptive" } = {
  width: 1200,
  height: 800,
  errorRadiusPx: null,
  verified: false,
  stabilize: false,
  profile: "remote-adaptive",
}

const sample = (x: number, y: number, timestamp: number) => ({
  point: [x / 1200, y / 800] as [number, number],
  timestamp,
})

function randomNoise() {
  let state = 1234567
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296 - 0.5
  }
}

function fixationMetrics(fps: number) {
  const processor = new GazeBubbleProcessor()
  const noise = randomNoise()
  let rawSquared = 0
  let filteredSquared = 0
  let count = 0
  for (let i = 0; i < fps * 12; i++) {
    const timestamp = (i * 1000) / fps
    const x = 600 + noise() * 36
    const y = 400 + noise() * 24
    const input = sample(x, y, timestamp)
    const result = processor.update(input, remote, timestamp)!
    expect(result.rawPoint).toEqual(input.point)
    expect(result.motion).toBe("moving")
    if (i >= fps * 2) {
      rawSquared += (x - 600) ** 2 + (y - 400) ** 2
      filteredSquared +=
        (result.center[0] * 1200 - 600) ** 2 +
        (result.center[1] * 800 - 400) ** 2
      count++
    }
  }
  return {
    rawRmsPx: Math.sqrt(rawSquared / count),
    filteredRmsPx: Math.sqrt(filteredSquared / count),
  }
}

test.each([30, 15, 5, 2])(
  "remote profile reduces synthetic fixation RMS at %d fps without locking",
  (fps) => {
    const metrics = fixationMetrics(fps)
    expect(metrics.filteredRmsPx).toBeLessThan(metrics.rawRmsPx * 0.85)
  }
)

test.each([30, 15, 5, 2])(
  "remote target jumps respond immediately and settle within three fresh updates at %d fps",
  (fps) => {
    const processor = new GazeBubbleProcessor()
    const interval = 1000 / fps
    processor.update(sample(400, 400, 0), remote, 0)
    let result = processor.update(sample(800, 400, interval), remote, interval)!
    expect(result.center[0] * 1200).toBeGreaterThan(500)
    for (let i = 2; i <= 3; i++) {
      result = processor.update(
        sample(800, 400, i * interval),
        remote,
        i * interval
      )!
    }
    expect(800 - result.center[0] * 1200).toBeLessThan(20)
  }
)

test.each([30, 15, 5, 2])(
  "remote profile follows smooth pursuit and sustained drift at %d fps",
  (fps) => {
    for (const speed of [10, 80]) {
      const processor = new GazeBubbleProcessor()
      let previous = 200
      for (let i = 0; i <= fps * 6; i++) {
        const timestamp = (i * 1000) / fps
        const target = 200 + (speed * timestamp) / 1000
        const result = processor.update(
          sample(target, 400, timestamp),
          remote,
          timestamp
        )!
        const center = result.center[0] * 1200
        expect(center).toBeGreaterThanOrEqual(previous)
        expect(target - center).toBeLessThan(25)
        if (i > 0) expect(center).toBeGreaterThan(previous)
        previous = center
      }
      expect(previous).toBeGreaterThan(200 + speed * 6 - 25)
    }
  }
)

test("remote uses actual uneven source intervals and keeps sparse delivery continuity", () => {
  const responses = [40, 500].map((interval) => {
    const processor = new GazeBubbleProcessor()
    processor.update(sample(600, 400, 0), remote, 0)
    return (
      processor.update(sample(612, 400, interval), remote, interval)!
        .center[0] * 1200
    )
  })
  expect(responses[1]).toBeGreaterThan(responses[0])
  expect(responses[1]).toBeLessThan(612)

  const processor = new GazeBubbleProcessor()
  let timestamp = 0
  for (const interval of [143, 500, 200, 400, 67, 300]) {
    timestamp += interval
    const result = processor.update(
      sample(600 + (timestamp % 2 ? 6 : -6), 400, timestamp),
      remote,
      timestamp
    )!
    expect(result).not.toBeNull()
    expect(result.center[0] * 1200).toBeGreaterThan(590)
    expect(result.center[0] * 1200).toBeLessThan(610)
  }
})

test("duplicate timestamps never advance the filter; backward time starts a new observation", () => {
  const processor = new GazeBubbleProcessor()
  processor.update(sample(600, 400, 0), remote, 0)
  const result = processor.update(sample(612, 400, 200), remote, 200)!
  for (const now of [200, 300, 700]) {
    expect(
      processor.update(sample(900, 400, 200), remote, now)!.center
    ).toEqual(result.center)
  }
  expect(processor.update(sample(300, 200, 100), remote, 700)!.center).toEqual([
    0.25, 0.25,
  ])
})

test("remote briefly missing readings hide gaze without discarding filter history", () => {
  const processor = new GazeBubbleProcessor()
  const uninterrupted = new GazeBubbleProcessor()
  for (const filter of [processor, uninterrupted]) {
    filter.update(sample(600, 400, 0), remote, 0)
    filter.update(sample(612, 400, 200), remote, 200)
  }
  expect(processor.update(null, remote, 250)).toBeNull()
  expect(processor.update(null, remote, 280)).toBeNull()
  const resumed = processor.update(sample(624, 400, 300), remote, 300)!
  const expected = uninterrupted.update(sample(624, 400, 300), remote, 300)!
  expect(resumed.center).toEqual(expected.center)
  expect(resumed.center[0] * 1200).toBeLessThan(624)
  expect(resumed.rawPoint).toEqual([0.52, 0.5])
})

test("remote missing readings never extend history lifetime or preserve changed context", () => {
  for (const options of [remote, { ...remote, width: 600, height: 400 }]) {
    const processor = new GazeBubbleProcessor()
    processor.update(sample(600, 400, 0), remote, 0)
    expect(processor.update(null, options, 100)).toBeNull()
    expect(processor.update(null, options, 500)).toBeNull()
    expect(processor.update(null, options, 1001)).toBeNull()
    expect(
      processor.update(sample(900, 400, 1002), options, 1002)!.center
    ).toEqual([0.75, 0.5])
  }
  const processor = new GazeBubbleProcessor()
  processor.update(sample(600, 400, 0), remote, 0)
  processor.update(null, { ...remote, width: 600 }, 100)
  expect(processor.update(sample(624, 400, 200), remote, 200)!.center).toEqual([
    0.52, 0.5,
  ])
})

test("a delayed fresh reading cannot revive expired pre-blink filter history", () => {
  const processor = new GazeBubbleProcessor()
  processor.update(sample(600, 400, 1000), remote, 1500)
  expect(processor.update(null, remote, 1600)).toBeNull()
  expect(
    processor.update(sample(612, 400, 1900), remote, 2400)!.center
  ).toEqual([0.51, 0.5])
})

test("remote invalid data, long gaps and viewport changes clear filter history", () => {
  for (const input of [sample(NaN, 400, 250), sample(Infinity, 400, 250)]) {
    const processor = new GazeBubbleProcessor()
    processor.update(sample(600, 400, 0), remote, 0)
    processor.update(sample(612, 400, 200), remote, 200)
    expect(processor.update(input, remote, 250)).toBeNull()
    expect(
      processor.update(sample(900, 400, 300), remote, 300)!.center
    ).toEqual([0.75, 0.5])
  }
  const processor = new GazeBubbleProcessor()
  processor.update(sample(600, 400, 0), remote, 0)
  expect(
    processor.update(sample(900, 400, 1001), remote, 1001)!.center
  ).toEqual([0.75, 0.5])
  expect(
    processor.update(
      sample(300, 200, 1200),
      { ...remote, width: 600, height: 400 },
      1200
    )!.center
  ).toEqual([0.25, 0.25])
  processor.reset()
  expect(
    processor.update(sample(960, 160, 1300), remote, 1300)!.center
  ).toEqual([0.8, 0.2])
})

test.each([
  [-0.1, 0.5],
  [1.1, 0.5],
  [0.5, -0.1],
  [0.5, 1.1],
  [-0.1, -0.1],
  [1.1, -0.1],
  [-0.1, 1.1],
  [1.1, 1.1],
])(
  "finite off-screen estimate %p,%p retains coordinates and measured error without verification",
  (x, y) => {
    const point = [x, y] as [number, number]
    const result = new GazeBubbleProcessor().update(
      { point, timestamp: 1000 },
      { ...remote, verified: true, errorRadiusPx: 200 },
      1000
    )!
    expect(result).not.toBeNull()
    expect(result.rawPoint).toEqual(point)
    expect(result.center).toEqual(point)
    expect(result.outside).toBe(true)
    expect(result.verified).toBe(false)
    expect(result.errorRadiusPx).toBe(200)
    expect(result.limited).toBe(true)
    expect(point).toEqual([x, y])
  }
)

test("crossing the screen boundary and reentering preserves filter history", () => {
  const processor = new GazeBubbleProcessor()
  processor.update({ point: [0.98, 0.5], timestamp: 1000 }, remote, 1000)
  const outside = processor.update(
    { point: [1.01, 0.5], timestamp: 1040 },
    remote,
    1040
  )!
  expect(outside).not.toBeNull()
  expect(outside.center[0]).toBeGreaterThan(0.98)
  expect(outside.center[0]).toBeLessThan(1.01)
  expect(outside.rawPoint).toEqual([1.01, 0.5])
  const returned = processor.update(
    { point: [0.99, 0.5], timestamp: 1080 },
    remote,
    1080
  )!
  expect(returned.center[0]).not.toBe(0.99)
  expect(returned.rawPoint).toEqual([0.99, 0.5])
  expect(returned.outside).toBe(false)
  expect(
    processor.update({ point: [1.01, 0.5], timestamp: 1120 }, remote, 2121)
  ).toBeNull()
  expect(
    processor.update({ point: [Infinity, 0.5], timestamp: 2200 }, remote, 2200)
  ).toBeNull()
  expect(
    processor.update({ point: [0.5, 0.5], timestamp: 2240 }, remote, 2240)!
      .center
  ).toEqual([0.5, 0.5])
})

test("reentry remains visibly unverified while the filtered center is still outside", () => {
  const processor = new GazeBubbleProcessor()
  const options = { ...remote, verified: true, errorRadiusPx: 40 }
  processor.update({ point: [1.1, 0.5], timestamp: 1000 }, options, 1000)
  const returned = processor.update(
    { point: [0.999, 0.5], timestamp: 1040 },
    options,
    1040
  )!
  expect(returned.rawPoint).toEqual([0.999, 0.5])
  expect(returned.center[0]).toBeGreaterThan(1)
  expect(returned.outside).toBe(true)
  expect(returned.verified).toBe(false)
  expect(returned.errorRadiusPx).toBe(40)
})

test("remote source age allows slow inference but never extends expiration on repaint", () => {
  const processor = new GazeBubbleProcessor()
  const input = sample(600, 400, 0)
  expect(processor.update(input, remote, 500)).not.toBeNull()
  expect(processor.update(input, remote, 1000)).not.toBeNull()
  expect(processor.update(input, remote, 1001)).toBeNull()
  expect(
    processor.update(sample(900, 400, 1100), remote, 1100)!.center
  ).toEqual([0.75, 0.5])
  expect(
    processor.update(input, { ...remote, maxAgeMs: 2000 }, 1001)
  ).toBeNull()
  expect(
    processor.update(sample(600, 400, 2000), { ...remote, maxAgeMs: 250 }, 2251)
  ).toBeNull()
})

test("uncertainty radius and stabilize cannot change remote filter strength or enable a lock", () => {
  const processors = [new GazeBubbleProcessor(), new GazeBubbleProcessor()]
  for (let i = 0; i < 10; i++) {
    const input = sample(600 + (i % 2 ? 4 : -4), 400, i * 200)
    const normal = processors[0].update(input, remote, input.timestamp)!
    const capped = processors[1].update(
      input,
      { ...remote, errorRadiusPx: 1000, stabilize: true },
      input.timestamp
    )!
    expect(capped.center).toEqual(normal.center)
    expect(capped.motion).toBe("moving")
    expect(capped.radiusPx).toBe(150)
  }
})
