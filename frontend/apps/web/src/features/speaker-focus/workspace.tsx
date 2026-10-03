import { useState } from "react"
import { EyeTrackingWorkspace } from "../../screens/eye-tracking-workspace"
import { ReferenceWorkspace } from "./reference-workspace"

export function SpeakerFocusWorkspace() {
  const [testing, setTesting] = useState(false)
  return (
    <>
      <div hidden={testing}>
        <EyeTrackingWorkspace
          sceneMode
          speakerMode
          active={!testing}
          onReference={() => setTesting(true)}
        />
      </div>
      {testing && <ReferenceWorkspace onSetup={() => setTesting(false)} />}
    </>
  )
}
