import { useEffect, useState } from "react"
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { useApiKeyActions } from "@/hooks/use-api-key-actions"
import { useAuthActions } from "@/hooks/use-auth-actions"
import { useAuthSession } from "@/hooks/use-auth-session"
import { AuthPage } from "@/pages/auth-page"
import { DashboardPage } from "@/pages/dashboard-page"
import { VerifyEmailPage } from "@/pages/verify-email-page"

export function App() {
  const { session, setSession, loadingSession, isAuthenticated, loadSession, signOut } = useAuthSession()

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const navigate = useNavigate()
  const location = useLocation()

  const isPublicPath = location.pathname === "/auth" || location.pathname === "/verify-email"

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

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    void apiKeyActions.loadApiKeys()
  }, [apiKeyActions.loadApiKeys])

  useEffect(() => {
    if (loadingSession) {
      return
    }

    if (isAuthenticated && location.pathname === "/auth") {
      navigate("/dashboard", { replace: true })
      return
    }

    if (!isAuthenticated && !isPublicPath) {
      navigate("/auth", { replace: true })
    }
  }, [isAuthenticated, isPublicPath, loadingSession, location.pathname, navigate])

  async function handleSignOut() {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await signOut()
      apiKeyActions.setApiKeys([])
      setMessage("Signed out.")
      navigate("/auth", { replace: true })
    } catch {
      setError("Sign out failed.")
    } finally {
      setBusy(false)
    }
  }

  if (loadingSession) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading session...</p>
      </main>
    )
  }

  return (
    <Routes>
      <Route
        path="/auth"
        element={
          <AuthPage
            mode={authActions.authMode}
            name={authActions.name}
            email={authActions.email}
            password={authActions.password}
            confirmPassword={authActions.confirmPassword}
            busy={busy}
            error={error}
            message={message}
            onModeChange={authActions.onModeChange}
            onNameChange={authActions.setName}
            onEmailChange={authActions.setEmail}
            onPasswordChange={authActions.setPassword}
            onConfirmPasswordChange={authActions.setConfirmPassword}
            onSignIn={() => void authActions.handleEmailSignIn()}
            onSignUp={() => void authActions.handleEmailSignUp()}
            onGoogleSignIn={() => void authActions.handleGoogleSignIn()}
          />
        }
      />
      <Route path="/verify-email" element={<VerifyEmailPage onVerified={() => void loadSession()} />} />
      <Route
        path="/dashboard"
        element={
          <DashboardPage
            session={session}
            busy={busy}
            loadingKeys={apiKeyActions.loadingKeys}
            apiKeys={apiKeyActions.apiKeys}
            newKeyName={apiKeyActions.newKeyName}
            createdApiKey={apiKeyActions.createdApiKey}
            error={error}
            message={message}
            onSignOut={() => void handleSignOut()}
            onNewKeyNameChange={apiKeyActions.setNewKeyName}
            onCreateKey={() => void apiKeyActions.handleCreateApiKey()}
            onCopyCreatedKey={() => void apiKeyActions.handleCopyCreatedKey()}
            onRegenerateKey={(key) => void apiKeyActions.handleRegenerateApiKey(key)}
            onDeleteKey={(key) => void apiKeyActions.handleDeleteApiKey(key)}
          />
        }
      />
      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? "/dashboard" : "/auth"} replace />}
      />
    </Routes>
  )
}
