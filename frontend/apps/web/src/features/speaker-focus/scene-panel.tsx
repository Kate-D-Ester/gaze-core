import { useEffect, useState } from "react"
import { SceneSelectionAdapter } from "./scene-adapter"
import type { SceneSpeakerPanelProps } from "./scene-panel.types"
export function SceneSpeakerPanel({
  frame,
  measurement,
  verified,
  identity,
}: SceneSpeakerPanelProps) {
  const [adapter] = useState(() => new SceneSelectionAdapter())
  useEffect(() => {
    adapter.observe({
      frame,
      measurement,
      verified,
      identity,
      tracks: [],
      now: performance.now(),
    })
  }, [adapter, frame, measurement, verified, identity])
  return (
    <section
      aria-label="Scene speaker focus"
      className="mt-4 space-y-2 rounded-lg border p-3 text-xs"
    >
      <h3 className="font-medium">Speaker focus</h3>
      <p>
        {verified
          ? "Current scene accuracy check passed; calibrated gaze can select a visible speaker."
          : "Click selection is available; verify scene accuracy to enable gaze selection."}
      </p>
      <p className="text-muted-foreground">
        Live separation requires the local speaker service and a separate
        microphone for video-only ESP32 streams.
      </p>
    </section>
  )
}
