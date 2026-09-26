import { describe, expect, test } from "bun:test"
import {
  clampRegion,
  moveRegion,
  resizeRegion,
  regionFromPoints,
} from "../../apps/web/src/features/eye-tracking/roi"

const bounds = { width: 640, height: 480 }
const region = { x: 100, y: 80, width: 200, height: 120 }

describe("bounded region editing", () => {
  test("clamps coordinates without shrinking a valid region", () => {
    expect(clampRegion({ ...region, x: 900, y: -12 }, bounds)).toEqual({
      x: 440,
      y: 0,
      width: 200,
      height: 120,
    })
  })
  test("limits oversized regions and enforces the minimum size", () => {
    expect(
      clampRegion({ x: -10, y: 500, width: 800, height: 2 }, bounds)
    ).toEqual({ x: 0, y: 456, width: 640, height: 24 })
    expect(
      clampRegion(
        { x: 0, y: 0, width: 24, height: 24 },
        { width: 10, height: 8 }
      )
    ).toEqual({ x: 0, y: 0, width: 10, height: 8 })
  })
  test("moves to all boundaries without changing size", () => {
    expect(moveRegion(region, [-500, -500], bounds)).toEqual({
      ...region,
      x: 0,
      y: 0,
    })
    expect(moveRegion(region, [900, 900], bounds)).toEqual({
      ...region,
      x: 440,
      y: 360,
    })
    expect(moveRegion(region, [12, -15], bounds)).toEqual({
      ...region,
      x: 112,
      y: 65,
    })
  })
  test("resizes corners while keeping the opposite corner fixed", () => {
    expect(resizeRegion(region, "nw", [-200, -200], bounds)).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 200,
    })
    expect(resizeRegion(region, "se", [900, 900], bounds)).toEqual({
      x: 100,
      y: 80,
      width: 540,
      height: 400,
    })
  })
  test("stops crossed resize handles at the minimum width and height", () => {
    expect(resizeRegion(region, "nw", [500, 500], bounds)).toEqual({
      x: 276,
      y: 176,
      width: 24,
      height: 24,
    })
    expect(resizeRegion(region, "se", [-500, -500], bounds)).toEqual({
      x: 100,
      y: 80,
      width: 24,
      height: 24,
    })
  })
  test("edge handles change only their own axis", () => {
    expect(resizeRegion(region, "e", [60, 80], bounds)).toEqual({
      ...region,
      width: 260,
    })
    expect(resizeRegion(region, "n", [50, 20], bounds)).toEqual({
      ...region,
      y: 100,
      height: 100,
    })
    expect(resizeRegion(region, "w", [-50, 30], bounds)).toEqual({
      ...region,
      x: 50,
      width: 250,
    })
    expect(resizeRegion(region, "s", [50, 30], bounds)).toEqual({
      ...region,
      height: 150,
    })
  })
  test("redraw works in either direction and stays inside the image", () => {
    expect(regionFromPoints([300, 200], [50, 40], bounds)).toEqual({
      x: 50,
      y: 40,
      width: 250,
      height: 160,
    })
    expect(regionFromPoints([630, 470], [800, 900], bounds)).toEqual({
      x: 616,
      y: 456,
      width: 24,
      height: 24,
    })
  })
  test("normalizes nonfinite and fractional numeric edits", () => {
    expect(
      clampRegion({ x: NaN, y: 30.6, width: Infinity, height: -3 }, bounds)
    ).toEqual({ x: 0, y: 31, width: 24, height: 24 })
  })
})
