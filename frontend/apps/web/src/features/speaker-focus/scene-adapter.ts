import { SelectionController } from "./selection"
import type { SceneSelectionInput } from "./scene-adapter.types"
import type { ImagePoint } from "./selection.types"
/** Uses the scene camera's already oriented image coordinates and calibration evidence. */
export class SceneSelectionAdapter {
  private readonly selection = new SelectionController()
  private input: SceneSelectionInput | null = null
  private identity = ""
  private generation = 0
  get state() {
    return this.selection.state
  }
  observe(input: SceneSelectionInput) {
    const identity = JSON.stringify([input.identity, input.frame?.generation])
    if (identity !== this.identity) {
      this.identity = identity
      this.selection.reset(++this.generation)
    }
    this.input = input
    if (
      !input.frame ||
      input.now - input.frame.timestamp > 150 ||
      input.now < input.frame.timestamp
    ) {
      this.selection.resetDwell()
      return this.selection.checkTracks([], input.now / 1000)
    }
    if ((!input.verified && !input.allowUnverifiedGaze) || !input.measurement) {
      this.selection.resetDwell()
      return this.selection.checkTracks(
        input.tracks,
        input.frame.timestamp / 1000
      )
    }
    return this.selection.observeGaze(
      {
        measurement: input.measurement,
        allowUnverifiedGaze: input.allowUnverifiedGaze,
        bubble: input.bubble,
        sourceGeneration: this.generation,
        mediaTime: input.frame.timestamp / 1000,
      },
      input.tracks,
      input.now
    )
  }
  click(point: ImagePoint, now: number) {
    const input = this.input
    if (
      !input?.frame ||
      now - input.frame.timestamp > 150 ||
      now < input.frame.timestamp
    ) {
      return this.selection.clear()
    }
    return this.selection.click(
      input.tracks,
      point,
      input.frame.timestamp / 1000
    )
  }
  clear() {
    return this.selection.clear()
  }
}
