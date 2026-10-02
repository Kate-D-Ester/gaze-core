"use client"

import { AuthPage } from "@/screens/auth-page"
import { DashboardPage } from "@/screens/dashboard-page"
import { VerifyEmailPage } from "@/screens/verify-email-page"
import { useAccountController } from "./use-account-controller"
import type { AccountPageProps } from "./account-page.types"

export function AccountPage({ view }: AccountPageProps) {
  const {
    session,
    loadingSession,
    isAuthenticated,
    busy,
    message,
    error,
    authActions,
    apiKeyActions,
    handleSignOut,
  } = useAccountController(view)
  if (loadingSession || (view === "dashboard" && !isAuthenticated)) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </main>
    )
  }
  if (view === "verify-email") {
    return <VerifyEmailPage />
  }
  if (view === "auth") {
    return (
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
    )
  }
  return (
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
  )
}
