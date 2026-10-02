import type { AuthMode } from "@/lib/auth.types"

export type VisibilityToggleProps = {
  checked: boolean
  label: string
  onToggle: () => void
}

export type AuthPageProps = {
  mode: AuthMode
  name: string
  email: string
  password: string
  confirmPassword: string
  busy: boolean
  message: string
  error: string
  onModeChange: (mode: AuthMode) => void
  onNameChange: (value: string) => void
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onConfirmPasswordChange: (value: string) => void
  onSignIn: () => void
  onSignUp: () => void
  onGoogleSignIn: () => void
}
