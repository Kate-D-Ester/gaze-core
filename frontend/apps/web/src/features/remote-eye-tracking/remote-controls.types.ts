import type { ReactNode } from "react"

import type { LucideIcon } from "lucide-react"

export type HintProps = {
  label: string
  children: ReactNode
  className?: string
}

export type IconButtonProps = {
  label: string
  icon: LucideIcon
  primary?: boolean
}

export type LocalVideoButtonProps = {
  onSelect: (file: File) => void
}

export type SetupHelpProps = { preparation?: string }
