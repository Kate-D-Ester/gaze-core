export type V2StepName =
  | "Camera"
  | "Eye region"
  | "Eye model"
  | "Calibrate"
  | "Live gaze"

export type V2StepCopy = readonly [title: string, description: string]
