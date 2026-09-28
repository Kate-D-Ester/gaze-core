import type { ReactNode } from "react"

export type V2StepPanelProps = {
  stepNumber: number
  stepName: string
  title: string
  description: string
  error?: string | null
  message?: string
  children: ReactNode
}
