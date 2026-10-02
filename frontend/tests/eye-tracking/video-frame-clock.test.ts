import { expect, test } from "bun:test"
import { VideoFrameClock } from "../../apps/web/src/features/eye-tracking/video-frame-clock"

test("camera timestamps are retained separately from inference and presentation time", () => {
  let callback: VideoFrameRequestCallback
  let cancelled = 0
  const video = {
    currentTime: 2,
    requestVideoFrameCallback(value: VideoFrameRequestCallback) {
      callback = value
      return 7
    },
    cancelVideoFrameCallback(handle: number) {
      cancelled = handle
    },
  } as HTMLVideoElement
  const clock = new VideoFrameClock()
  clock.watch(video)
  callback!(2000, {
    mediaTime: 2,
    captureTime: 1900,
    presentationTime: 1980,
  } as VideoFrameCallbackMetadata)
  expect(clock.read(2010)).toBe(1900)
  callback!(2020, {
    mediaTime: 2,
    presentationTime: 2000,
  } as VideoFrameCallbackMetadata)
  expect(clock.read(2030)).toBe(2000)
  clock.stop()
  expect(cancelled).toBe(7)
  expect(clock.read(2040)).toBe(2040)
})

test("unsupported callbacks and old seek metadata cannot stamp a new image", () => {
  let callback: VideoFrameRequestCallback
  const video = {
    currentTime: 4,
    requestVideoFrameCallback(value: VideoFrameRequestCallback) {
      callback = value
      return 1
    },
    cancelVideoFrameCallback() {},
  } as HTMLVideoElement
  const clock = new VideoFrameClock()
  clock.watch(video)
  callback!(1000, {
    mediaTime: 2,
    captureTime: 900,
    presentationTime: 990,
  } as VideoFrameCallbackMetadata)
  expect(clock.read(1100)).toBe(1100)
  clock.watch({ currentTime: 0 } as HTMLVideoElement)
  expect(clock.read(1200)).toBe(1200)
  clock.stop()
})
