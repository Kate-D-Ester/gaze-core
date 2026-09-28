import { expect, test } from "bun:test"
import { shouldIncludePreviewMasks } from "../../apps/web/src/features/eye-tracking/preview-mask-policy"

test("preview masks are skipped while the threshold comparison is closed", () => {
  expect(shouldIncludePreviewMasks(false, 1000, -Infinity)).toBe(false)
})

test("preview masks refresh at the configured interval while the comparison is open", () => {
  expect(shouldIncludePreviewMasks(true, 1000, -Infinity)).toBe(true)
  expect(shouldIncludePreviewMasks(true, 1100, 1000)).toBe(false)
  expect(shouldIncludePreviewMasks(true, 1200, 1000)).toBe(true)
})
