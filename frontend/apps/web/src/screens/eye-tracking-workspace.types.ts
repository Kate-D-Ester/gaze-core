export type EyeTrackingWorkspaceProps = {
  sceneMode?: boolean
  speakerMode?: boolean
  active?: boolean
  onReference?: () => void
}

export type SetupStepName =
  | "Camera"
  | "Eye region"
  | "Eye model"
  | "Head tracker"
  | "Calibrate"
  | "Live gaze"
