import { useState } from "react"
import { EyeTrackingWorkspace } from "../../screens/eye-tracking-workspace"
import { ReferenceWorkspace } from "./reference-workspace"
import { FileExportWorkspace } from "./file-export-workspace"
export function SpeakerFocusWorkspace() {
  const [view, setView] = useState<"setup" | "reference" | "export">("setup")
  return (
    <>
      <div hidden={view !== "setup"}>
        <EyeTrackingWorkspace
          sceneMode
          speakerMode
          active={view === "setup"}
          onReference={() => setView("reference")}
        />
      </div>
      {view === "reference" && (
        <ReferenceWorkspace
          onSetup={() => setView("setup")}
          onExport={() => setView("export")}
        />
      )}
      {view === "export" && (
        <FileExportWorkspace onReference={() => setView("reference")} />
      )}
    </>
  )
}
