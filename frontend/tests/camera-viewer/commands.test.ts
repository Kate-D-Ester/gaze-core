import { expect, test } from "bun:test"
import { parseViewerCommand } from "../../apps/web/src/features/camera-viewer/commands"

test("viewer commands accept only complete supported phrases", () => {
  expect(parseViewerCommand(" Select it! ")).toEqual({ kind: "select" })
  expect(parseViewerCommand("take a photo")).toEqual({ kind: "photo" })
  expect(parseViewerCommand("switch camera")).toEqual({ kind: "next-camera" })
  expect(parseViewerCommand("SCENE CAMERA")).toEqual({
    kind: "camera",
    role: "scene",
  })
  for (const text of [
    "",
    "do not select",
    "select and take photo",
    "photo tomorrow",
    "lock it",
    "fire",
    "auto fire",
  ]) {
    expect(parseViewerCommand(text)).toBeNull()
  }
})
