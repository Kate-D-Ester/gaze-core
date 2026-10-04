import { boxAtTime } from "./face-geometry"
import { matchFaceLocation } from "./face-locations"
import { freshSceneFrame, SceneSourceIdentity } from "./scene-frame"
import type { Box } from "./client.types"
import { SelectionController } from "./selection"
import type { SceneSelectionInput } from "./scene-adapter.types"
import type { ImagePoint } from "./selection.types"
/** Uses the scene camera's already oriented image coordinates and calibration evidence. */
export class SceneSelectionAdapter {
  private readonly selection = new SelectionController()
  private input: SceneSelectionInput | null = null
  private readonly sourceIdentity = new SceneSourceIdentity()
  private identity = ""
  private lockedBox: Box | null = null
  private lastFrameTime = -Infinity
  private interrupted = false
  private frameGeneration: number | null = null
  get waitingForScene() {
    return this.interrupted
  }
  private generation = 0
  get state() {
    return this.selection.state
  }
  observe(input: SceneSelectionInput) {
    const identity = this.sourceIdentity.observe(input.identity, input.frame)
    if (identity !== this.identity) {
      this.identity = identity
      this.selection.reset(++this.generation)
      this.lockedBox = null
      this.interrupted = false
      this.frameGeneration = null
      this.lastFrameTime = -Infinity
    }
    if (input.frame && input.frame.generation !== this.frameGeneration) {
      if (this.frameGeneration !== null) {
        this.interrupted = true
        this.selection.resetDwell()
      }
      this.frameGeneration = input.frame.generation
    }
    this.input = input
    if (!input.frame || !freshSceneFrame(input.frame, input.now)) {
      this.interrupted = true
      this.selection.resetDwell()
      return this.state
    }
    const time = input.frame.timestamp / 1000
    const previousId = this.state.selectedId
    if (this.interrupted && this.lockedBox) {
      // Require a new detection, not the last box from before the video gap.
      const current = input.tracks.filter((track) =>
        track.observations.some(
          (observation) => observation.timestamp > this.lastFrameTime
        )
      )
      if (!current.length) {
        this.selection.resetDwell()
        return this.state
      }
      const id = matchFaceLocation(this.lockedBox, current, time)
      const track = current.find((candidate) => candidate.id === id)
      const box = track ? boxAtTime(track, time) : null
      if (box && track) {
        this.selection.click(
          [track],
          [box[0] + box[2] / 2, box[1] + box[3] / 2],
          time
        )
        this.interrupted = false
      } else {
        this.selection.checkTracks([], time)
      }
    } else {
      this.interrupted = false
    }
    let next
    if ((!input.verified && !input.allowUnverifiedGaze) || !input.measurement) {
      this.selection.resetDwell()
      next = this.selection.checkTracks(input.tracks, time)
    } else {
      next = this.selection.observeGaze(
        {
          measurement: input.measurement,
          allowUnverifiedGaze: input.allowUnverifiedGaze,
          bubble: input.bubble,
          sourceGeneration: this.generation,
          mediaTime: time,
        },
        input.tracks,
        input.now
      )
    }
    if (next.selectedId !== previousId && !next.paused) {
      this.interrupted = false
    }
    if (!this.interrupted) {
      this.lastFrameTime = time
    }
    const selected = input.tracks.find((track) => track.id === next.selectedId)
    const box = selected ? boxAtTime(selected, time) : null
    if (box && !next.paused) {
      this.lockedBox = box
    }
    return next
  }
  click(point: ImagePoint, now: number) {
    const input = this.input
    if (!input?.frame || !freshSceneFrame(input.frame, now)) {
      return this.state
    }
    this.interrupted = false
    const next = this.selection.click(
      input.tracks,
      point,
      input.frame.timestamp / 1000
    )
    const selected = input.tracks.find((track) => track.id === next.selectedId)
    this.lockedBox = selected
      ? boxAtTime(selected, input.frame.timestamp / 1000)
      : null
    return next
  }
  clear() {
    this.lockedBox = null
    this.interrupted = false
    return this.selection.clear()
  }
}
