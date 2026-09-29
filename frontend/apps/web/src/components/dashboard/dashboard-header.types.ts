import type { SessionData } from "@/lib/auth.types"

export type DashboardHeaderProps = {
  session: SessionData
  busy: boolean
  onSignOut: () => void
}
