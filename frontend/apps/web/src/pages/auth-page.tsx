import { useState } from "react"
import { Button } from "@workspace/ui/components/button"

type AuthPageProps = {
  mode: "sign-in" | "sign-up"
  name: string
  email: string
  password: string
  confirmPassword: string
  busy: boolean
  message: string
  error: string
  onModeChange: (mode: "sign-in" | "sign-up") => void
  onNameChange: (value: string) => void
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onConfirmPasswordChange: (value: string) => void
  onSignIn: () => void
  onSignUp: () => void
  onGoogleSignIn: () => void
}

export function AuthPage({
  mode,
  name,
  email,
  password,
  confirmPassword,
  busy,
  message,
  error,
  onModeChange,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSignIn,
  onSignUp,
  onGoogleSignIn,
}: AuthPageProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  function VisibilityToggle({
    checked,
    label,
    onToggle,
  }: {
    checked: boolean
    label: string
    onToggle: () => void
  }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className="inline-flex select-none items-center gap-2 text-xs text-muted-foreground"
      >
        <span>{label}</span>
        <span
          className={`relative h-5 w-10 rounded-full border transition-colors ${checked ? "bg-foreground/20" : "bg-muted"}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
          />
        </span>
      </button>
    )
  }

  return (
    <main className="grid min-h-svh place-items-center bg-gradient-to-b from-background to-muted/40 p-6">
      <section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">GazeCore Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in with Google OAuth or email/password. Session auth keeps you logged in.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant={mode === "sign-in" ? "default" : "outline"}
            disabled={busy}
            onClick={() => onModeChange("sign-in")}
          >
            Sign In
          </Button>
          <Button
            variant={mode === "sign-up" ? "default" : "outline"}
            disabled={busy}
            onClick={() => onModeChange("sign-up")}
          >
            Sign Up
          </Button>
        </div>

        <div className="mt-5 space-y-3">
          {mode === "sign-up" ? (
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Name"
              autoComplete="name"
            />
          ) : null}
          <input
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Email"
            type="email"
            autoComplete="email"
          />
          <input
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Password"
            type={showPassword ? "text" : "password"}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          />
          <div className="-mt-1 flex justify-end">
            <VisibilityToggle
              checked={showPassword}
              label="Show password"
              onToggle={() => setShowPassword((value) => !value)}
            />
          </div>

          {mode === "sign-up" ? (
            <>
              <input
                value={confirmPassword}
                onChange={(event) => onConfirmPasswordChange(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Confirm password"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
              />
              <div className="-mt-1 flex justify-end">
                <VisibilityToggle
                  checked={showConfirmPassword}
                  label="Show confirm password"
                  onToggle={() => setShowConfirmPassword((value) => !value)}
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-4">
          <Button
            className="w-full"
            disabled={busy}
            onClick={mode === "sign-up" ? onSignUp : onSignIn}
          >
            {mode === "sign-up" ? "Create Account" : "Sign In"}
          </Button>
        </div>

        <Button
          className="mt-3 w-full"
          variant="secondary"
          disabled={busy}
          onClick={onGoogleSignIn}
        >
          Continue with Google
        </Button>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-600">{message}</p> : null}
      </section>
    </main>
  )
}
