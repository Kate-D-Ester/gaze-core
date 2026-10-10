export type RemoteSetupProgressProps = {
  step: number
  replaying: boolean
  allowedSteps: number[]
  onStepChange: (step: number) => void
}
