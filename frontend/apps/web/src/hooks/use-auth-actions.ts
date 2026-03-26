import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { authClient } from "@/lib/auth-client"
import { getBackendAuthMessage, parseAuthError } from "@/lib/auth-error"
import { extractSessionUser } from "@/lib/session-user"
import type { SessionData } from "@/types/auth"

type UseAuthActionsParams = {
  setBusy: (value: boolean) => void
  setError: (value: string) => void
  setMessage: (value: string) => void
  setSession: (value: SessionData) => void
  loadSession: () => Promise<void>
}

export function useAuthActions({
  setBusy,
  setError,
  setMessage,
  setSession,
  loadSession,
}: UseAuthActionsParams) {
  const navigate = useNavigate()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [name, setName] = useState("")
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in")

  function onModeChange(nextMode: "sign-in" | "sign-up") {
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

      localStorage.setItem("pendingSignInEmail", email)
      localStorage.setItem("pendingSignInPassword", password)
      setMessage("✅ Check your email for a verification link. The link expires in 24 hours.")
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
      navigate("/dashboard", { replace: true })
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
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/dashboard`,
      })
    } catch {
      setError("Google OAuth failed to start.")
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
