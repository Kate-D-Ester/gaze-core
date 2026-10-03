import { expect, test, spyOn } from "bun:test"
import { ReplayController } from "../../apps/web/src/features/speaker-focus/replay-controller"
import { SpeakerClient } from "../../apps/web/src/features/speaker-focus/client"
test("reference connection never requests uploaded-file analysis or extraction", async () => {
  const health = spyOn(SpeakerClient.prototype, "health").mockRejectedValue(
    new Error("offline")
  )
  const upload = spyOn(SpeakerClient.prototype, "upload")
  const controller = new ReplayController()
  try {
    await controller.connect()
    expect(controller.getSnapshot().serviceError).toContain("offline")
    expect(upload).not.toHaveBeenCalled()
    expect(controller.getSnapshot().mode).toBe("focused")
  } finally {
    controller.dispose()
    health.mockRestore()
    upload.mockRestore()
  }
})
