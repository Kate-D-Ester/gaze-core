import { useCallback, useState } from "react"
import { authClient } from "@/lib/auth-client"
import type { SessionData } from "@/types/auth"

export function useAuthSession() {
  const [session, setSession] = useState<SessionData>(null)
  const [loadingSession, setLoadingSession] = useState(true)

  const isAuthenticated = Boolean(session?.user?.id)

  const loadSession = useCallback(async () => {
    setLoadingSession(true)
    try {
      const result = await authClient.getSession()
      setSession((result.data as SessionData) ?? null)
    } catch {
      setSession(null)
    } finally {
      setLoadingSession(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    await authClient.signOut()
    setSession(null)
  }, [])

  return {
    session,
    setSession,
    loadingSession,
    isAuthenticated,
    loadSession,
    signOut,
  }
}
