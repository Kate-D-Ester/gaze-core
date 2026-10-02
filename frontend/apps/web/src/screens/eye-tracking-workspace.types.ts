export type EyeTrackingWorkspaceProps = {
  sceneMode?: boolean
}

export type SetupStepName =
  | "Camera"
  | "Eye region"
  | "Eye model"
  | "Head tracker"
  | "Calibrate"
  | "Live gaze"
