import { authClient } from "@/lib/auth-client"
import { getBackendAuthMessage, parseAuthError } from "@/lib/auth-error"
import type { AuthMode } from "@/lib/auth.types"
import { extractSessionUser } from "@/lib/session-user"
import { useRouter } from "next/navigation"
import { useState } from "react"
import type { UseAuthActionsParams } from "./use-auth-actions.types"
export function useAuthActions({
  setBusy,
  setError,
  setMessage,
  setSession,
  loadSession,
}: UseAuthActionsParams) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [name, setName] = useState("")
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in")
  function onModeChange(nextMode: AuthMode) {
    setAuthMode(nextMode)
    setError("")
    setMessage("")
    if (nextMode === "sign-in") {
      setConfirmPassword("")
    }
  }
  async function handleEmailSignUp() {
    if (!name.trim()) {
      setError("Name is required.")
      return
    }
    if (!email.trim()) {
      setError("Email is required.")
      return
    }
    if (!password.trim() || password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    if (!confirmPassword.trim()) {
      setError("Please confirm your password.")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
      })
      const parsed = parseAuthError(result)
      if (parsed.message || (parsed.status !== null && parsed.status >= 400)) {
        setError(getBackendAuthMessage(parsed))
        return
      }
      setMessage(
        "Check your email for a verification link. The link expires in 24 hours."
      )
      setAuthMode("sign-in")
      setName("")
      setEmail("")
      setPassword("")
      setConfirmPassword("")
    } catch (err) {
      setError(getBackendAuthMessage(parseAuthError(err)))
    } finally {
      setBusy(false)
    }
  }
  async function handleEmailSignIn() {
    if (!email.trim()) {
      setError("Email is required.")
      return
    }
    if (!password.trim()) {
      setError("Password is required.")
      return
    }
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const result = await authClient.signIn.email({
        email,
        password,
      })
      const parsed = parseAuthError(result)
      if (parsed.message || (parsed.status !== null && parsed.status >= 400)) {
        setError(getBackendAuthMessage(parsed))
        return
      }
      const signedInSession = extractSessionUser(result?.data)
      if (!signedInSession) {
        setError("Email or password is incorrect.")
        return
      }
      setSession(signedInSession)
      setMessage("")
      router.replace("/dashboard")
      void loadSession()
    } catch (err) {
      setError(getBackendAuthMessage(parseAuthError(err)))
    } finally {
      setBusy(false)
    }
  }
  async function handleGoogleSignIn() {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/dashboard`,
      })
      const parsed = parseAuthError(result)
      if (parsed.message || (parsed.status !== null && parsed.status >= 400)) {
        setError(getBackendAuthMessage(parsed))
      }
    } catch {
      setError("Google OAuth failed to start.")
    } finally {
      setBusy(false)
    }
  }
  return {
    authMode,
    name,
    email,
    password,
    confirmPassword,
    onModeChange,
    setName,
    setEmail,
    setPassword,
    setConfirmPassword,
    handleEmailSignIn,
    handleEmailSignUp,
    handleGoogleSignIn,
  }
}
