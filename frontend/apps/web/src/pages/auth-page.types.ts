export type VisibilityToggleProps = {
  checked: boolean
  label: string
  onToggle: () => void
}

export type AuthPageProps = {
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
