import { expect, test } from "bun:test"
import {
  selectByBubble,
  visibleSelectionBubble,
} from "../../apps/web/src/features/speaker-focus/bubble-selection"
import { selectByPoint } from "../../apps/web/src/features/speaker-focus/selection"
import type {
  Box,
  FaceTrack,
} from "../../apps/web/src/features/speaker-focus/client.types"
import type { GazeBubbleOverlaySnapshot } from "../../apps/web/src/features/gaze-bubble/gaze-bubble-overlay.types"
import type { GazeMeasurement } from "../../apps/web/src/features/scene-eye-tracking/scene.types"
const track = (id: string, box: Box): FaceTrack => ({
  id,
  manual: false,
  observations: [{ timestamp: 1, box }],
})
const bubble = {
  center: [0.5, 0.5] as const,
  radius: [0.2, 0.2] as const,
  timestamp: 100,
}

test("the most-covered face wins even when the bubble center lies on a smaller face", () => {
  const tracks = [
    track("larger overlap", [0.35, 0.4, 0.1, 0.2]),
    track("center only", [0.49, 0.48, 0.03, 0.04]),
    track("smallest", [0.56, 0.49, 0.02, 0.02]),
  ]
  expect(selectByPoint(tracks, bubble.center, 1)).toBe("center only")
  expect(selectByBubble(tracks, bubble, 1)).toBe("larger overlap")
})
test("circle corners and expired face boxes cannot attract the bubble", () => {
  const tracks = [track("outside circle", [0.68, 0.68, 0.02, 0.02])]
  expect(selectByBubble(tracks, bubble, 1)).toBeNull()
  expect(
    selectByBubble([track("expired", [0.4, 0.4, 0.1, 0.1])], bubble, 2)
  ).toBeNull()
})
test("equal coverage preserves the existing person instead of choosing arbitrarily", () => {
  const tracks = [
    track("left", [0.35, 0.4, 0.1, 0.2]),
    track("right", [0.55, 0.4, 0.1, 0.2]),
  ]
  expect(selectByBubble(tracks, bubble, 1)).toBeNull()
  expect(selectByBubble(tracks, bubble, 1, "right")).toBe("right")
})
test("a circular screen bubble respects different image-axis scales", () => {
  const tracks = [
    track("bottom", [0.48, 0.68, 0.04, 0.02]),
    track("right", [0.68, 0.48, 0.02, 0.04]),
  ]
  expect(
    selectByBubble(tracks, { ...bubble, radius: [40 / 320, 40 / 180] }, 1)
  ).toBe("bottom")
  expect(
    selectByBubble(tracks, { ...bubble, radius: [40 / 180, 40 / 320] }, 1)
  ).toBe("right")
})
test("invalid bubble geometry cannot select a voice", () => {
  const tracks = [track("face", [0.4, 0.4, 0.2, 0.2])]
  for (const radius of [
    [0, 0.2],
    [NaN, 0.2],
    [2, 0.2],
  ] as const) {
    expect(selectByBubble(tracks, { ...bubble, radius }, 1)).toBeNull()
  }
})
test("selection uses the displayed bubble with fresh, matching measured evidence", () => {
  const snapshot: GazeBubbleOverlaySnapshot = {
    bubble: {
      center: [0.2, 0.3],
      rawPoint: [0.2, 0.3],
      radiusPx: 14,
      errorRadiusPx: 8,
      limited: false,
      verified: true,
      motion: "moving",
    },
    view: { width: 320, height: 180, left: 0, top: 20, scale: 1 },
  }
  const measurement: GazeMeasurement = {
    timestamp: 100,
    eyeTimestamp: 100,
    sceneTimestamp: 100,
    eyeId: 1,
    sceneId: 1,
    confidence: 0.9,
    position: [0.2, 0.3],
    pixels: [64, 54],
    valid: true,
    reason: "",
    extrapolated: false,
  }
  expect(visibleSelectionBubble(snapshot, measurement, true, 100)).toEqual({
    center: [0.2, 0.3],
    radius: [14 / 320, 14 / 180],
    timestamp: 100,
  })
  expect(visibleSelectionBubble(snapshot, measurement, true, 251)).toBeNull()
  expect(visibleSelectionBubble(snapshot, measurement, false, 100)).toBeNull()
  expect(
    visibleSelectionBubble(
      snapshot,
      { ...measurement, position: [0.8, 0.3] },
      true,
      100
    )
  ).toBeNull()
})
