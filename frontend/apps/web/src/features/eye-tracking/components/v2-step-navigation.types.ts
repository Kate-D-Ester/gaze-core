export type V2StepNavigationProps = {
  steps: readonly string[]
  activeStep: number
  completedSteps: ReadonlySet<number>
  availableSteps: ReadonlySet<number>
  onSelectStep: (index: number) => void
}
