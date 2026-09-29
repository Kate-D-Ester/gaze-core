import type { SessionData } from "@/lib/auth.types"

export type UseAuthActionsParams = {
  setBusy: (value: boolean) => void
  setError: (value: string) => void
  setMessage: (value: string) => void
  setSession: (value: SessionData) => void
  loadSession: () => Promise<void>
}
