import type { LucideIcon } from "lucide-react"
import type { RemoteMode } from "../remote-eye-tracking.types"
export type RemoteModeOption = {
  id: RemoteMode
  title: string
  short: string
  icon: LucideIcon
  hint: string
  preparation: string
}
export type RemoteSetupStep = { label: string; icon: LucideIcon }
