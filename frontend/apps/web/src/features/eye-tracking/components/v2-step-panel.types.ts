import type { ReactNode } from "react"

export type V2StepPanelProps = {
  stepName: string
  description: string
  error?: string | null
  message?: string
  stage?: ReactNode
  children: ReactNode
}
