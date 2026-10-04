import type { SceneObservation } from "../scene-eye-tracking/scene.types"

/** Fresh observations authorize face selection; missing video never stops the microphone. */
export function freshSceneFrame(
  frame: SceneObservation | null,
  now: number
): boolean {
  return (
    !!frame &&
    Number.isFinite(frame.timestamp) &&
    now >= frame.timestamp &&
    now - frame.timestamp <= 150
  )
}

/** Frame epochs change on transport retries; source identity and geometry do not. */
export class SceneSourceIdentity {
  private geometry = ""
  observe(
    identity: string,
    frame: SceneObservation | null,
    sourceKey = ""
  ): string {
    if (frame) {
      this.geometry = JSON.stringify([frame.width, frame.height])
    }
    return JSON.stringify([identity, sourceKey, this.geometry])
  }
}
