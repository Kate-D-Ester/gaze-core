import { expect, test } from "bun:test"
import {
  projectGazeToScreen,
  projectGazeToViewport,
  transformGazeRay,
} from "../../research/gaze-3d/browser/gaze-geometry"
import type {
  MetricScreen,
  RigidTransform,
} from "../../research/gaze-3d/browser/gaze-geometry.types"

const screen: MetricScreen = {
  centerMetres: [0, 0, 0],
  right: [1, 0, 0],
  down: [0, 1, 0],
  widthMetres: 0.4,
  heightMetres: 0.25,
  pixelWidth: 1600,
  pixelHeight: 1000,
}

test("a tilted translated screen uses its physical right/down axes", () => {
  const result = projectGazeToScreen(
    { originMetres: [0.03, -0.02, 0.62], direction: [0.15, -0.155, -0.63] },
    { ...screen, centerMetres: [0.1, -0.1, 0.05], right: [0.8, 0, -0.6] }
  )
  expect(result.kind).toBe("projected")
  if (result.kind !== "projected") {
    throw new Error("Expected a screen intersection")
  }
  expect(result.normalized[0]).toBeCloseTo(0.75, 12)
  expect(result.normalized[1]).toBeCloseTo(0.2, 12)
  expect(result.pixels[0]).toBeCloseTo(1200, 9)
  expect(result.pixels[1]).toBeCloseTo(200, 9)
  expect(result.intersectionMetres[2]).toBeCloseTo(-0.01, 12)
})

test("off-screen intersections remain raw instead of fitting inside a box", () => {
  const result = projectGazeToScreen(
    { originMetres: [0, 0, 0.6], direction: [0.4, 0.2, -0.6] },
    screen
  )
  expect(result.kind).toBe("projected")
  if (result.kind === "projected") {
    expect(result.normalized).toEqual([1.5, 1.3])
    expect(result.outside).toBe(true)
  }
})

test("screen pixels become viewport coordinates using explicit browser content bounds", () => {
  const ray = {
    originMetres: [0, 0, 0.6] as [number, number, number],
    direction: [0, 0, -1] as [number, number, number],
  }
  const result = projectGazeToViewport(ray, screen, {
    leftPixels: 200,
    topPixels: 100,
    widthPixels: 1200,
    heightPixels: 800,
  })
  expect(result.kind).toBe("projected")
  if (result.kind === "projected") {
    expect(result.normalized).toEqual([0.5, 0.5])
    expect(result.pixels).toEqual([600, 400])
  }
  expect(
    projectGazeToViewport(ray, screen, {
      leftPixels: 200,
      topPixels: 100,
      widthPixels: 1500,
      heightPixels: 800,
    })
  ).toEqual({ kind: "unavailable", reason: "invalid-viewport" })
})

test("runtime vector shape errors return unavailable instead of throwing", () => {
  const malformed = {
    originMetres: [0, 0, 0.6] as [number, number, number],
    direction: undefined as unknown as [number, number, number],
  }
  expect(projectGazeToScreen(malformed, screen)).toEqual({
    kind: "unavailable",
    reason: "invalid-ray",
  })
})

test("zero, nonfinite, grazing and backwards rays have explicit failures", () => {
  for (const direction of [
    [0, 0, 0],
    [NaN, 0, -1],
  ]) {
    expect(
      projectGazeToScreen(
        {
          originMetres: [0, 0, 0.6],
          direction: direction as [number, number, number],
        },
        screen
      )
    ).toEqual({ kind: "unavailable", reason: "invalid-ray" })
  }
  expect(
    projectGazeToScreen(
      { originMetres: [0, 0, 0.6], direction: [1, 0, 0] },
      screen
    )
  ).toEqual({ kind: "unavailable", reason: "parallel-ray" })
  expect(
    projectGazeToScreen(
      { originMetres: [0, 0, 0.6], direction: [0, 0, 1] },
      screen
    )
  ).toEqual({ kind: "unavailable", reason: "backward-ray" })
})

test("screen axes and dimensions cannot silently rescale a physical ray", () => {
  const ray = {
    originMetres: [0, 0, 0.6] as [number, number, number],
    direction: [0, 0, -1] as [number, number, number],
  }
  for (const changed of [
    { ...screen, widthMetres: 0 },
    { ...screen, pixelHeight: Infinity },
    { ...screen, right: [2, 0, 0] as [number, number, number] },
    { ...screen, down: [1, 0, 0] as [number, number, number] },
  ]) {
    expect(projectGazeToScreen(ray, changed)).toEqual({
      kind: "unavailable",
      reason: "invalid-screen",
    })
  }
})

test("rigid movement translates the origin and rotates the direction only", () => {
  const transform: RigidTransform = {
    rotation: [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
    translationMetres: [0.2, -0.1, 0.3],
  }
  expect(
    transformGazeRay(
      { originMetres: [0.1, 0.2, 0.4], direction: [1, 0, 0] },
      transform
    )
  ).toEqual({ originMetres: [0, 0, 0.7], direction: [0, 1, 0] })
})

test("scaled and reflected matrices cannot masquerade as head rotation", () => {
  const ray = {
    originMetres: [0, 0, 0.6] as [number, number, number],
    direction: [0, 0, -1] as [number, number, number],
  }
  for (const rotation of [
    [
      [2, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  ]) {
    expect(
      transformGazeRay(ray, {
        rotation: rotation as RigidTransform["rotation"],
        translationMetres: [0, 0, 0],
      })
    ).toBeNull()
  }
})
