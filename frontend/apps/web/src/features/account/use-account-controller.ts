import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useApiKeyActions } from "@/hooks/use-api-key-actions"
import { useAuthActions } from "@/hooks/use-auth-actions"
import { useAuthSession } from "@/hooks/use-auth-session"
import type { AccountView } from "./account-page.types"

export function useAccountController(view: AccountView) {
  const {
    session,
    setSession,
    loadingSession,
    isAuthenticated,
    loadSession,
    signOut,
  } = useAuthSession()

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const router = useRouter()

  const isPublicPath = view === "auth" || view === "verify-email"

  const authActions = useAuthActions({
    setBusy,
    setError,
    setMessage,
    setSession,
    loadSession,
  })

  const apiKeyActions = useApiKeyActions({
    isAuthenticated,
    setBusy,
    setError,
    setMessage,
  })
  const loadApiKeys = apiKeyActions.loadApiKeys

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    void loadApiKeys()
  }, [loadApiKeys])

  useEffect(() => {
    if (loadingSession) {
      return
    }

    if (isAuthenticated && view === "auth") {
      router.replace("/dashboard")
      return
    }

    if (!isAuthenticated && !isPublicPath) {
      router.replace("/auth")
    }
  }, [isAuthenticated, isPublicPath, loadingSession, view, router])

  async function handleSignOut() {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await signOut()
      apiKeyActions.setApiKeys([])
      setMessage("Signed out.")
      router.replace("/auth")
    } catch {
      setError("Sign out failed.")
    } finally {
      setBusy(false)
    }
  }

  return {
    session,
    loadingSession,
    isAuthenticated,
    busy,
    message,
    error,
    authActions,
    apiKeyActions,
    loadSession,
    handleSignOut,
  }
}
