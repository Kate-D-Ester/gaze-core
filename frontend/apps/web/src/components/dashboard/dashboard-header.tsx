import { Button } from "@workspace/ui/components/button"
import type { SessionData } from "@/types/auth"

type DashboardHeaderProps = {
  session: SessionData
  busy: boolean
  onSignOut: () => void
}

export function DashboardHeader({
  session,
  busy,
  onSignOut,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {session?.user?.email}
        </p>
      </div>
      <Button variant="outline" disabled={busy} onClick={onSignOut}>
        Sign Out
      </Button>
    </header>
  )
}
