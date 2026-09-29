export type UseApiKeyActionsParams = {
  isAuthenticated: boolean
  setBusy: (value: boolean) => void
  setError: (value: string) => void
  setMessage: (value: string) => void
}
