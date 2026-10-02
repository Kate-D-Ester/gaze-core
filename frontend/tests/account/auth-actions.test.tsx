import { afterEach, expect, mock, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement } from "../../apps/web/node_modules/react"
import { createRoot } from "../../apps/web/node_modules/react-dom/client"
import type { AuthActions } from "./auth-actions.types"

if (typeof document === "undefined") {
  GlobalRegistrator.register()
}
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
})
const replace = mock(() => {})
const signUp = mock(async () => ({
  data: { user: { id: "test-user" } },
  error: null,
}))
const signIn = mock(async () => ({
  data: { user: { id: "test-user", email: "test@example.test" } },
  error: null,
}))
const social = mock(async () => ({
  error: { status: 503, message: "Provider unavailable" },
}))
mock.module("next/navigation", () => ({ useRouter: () => ({ replace }) }))
mock.module("../../apps/web/src/lib/auth-client", () => ({
  authClient: { signUp: { email: signUp }, signIn: { email: signIn, social } },
}))
const { useAuthActions } =
  await import("../../apps/web/src/hooks/use-auth-actions")
const { clearLegacySignInCredentials } =
  await import("../../apps/web/src/lib/legacy-sign-in-cleanup")
const busy = mock(() => {})
const error = mock(() => {})
let actions: AuthActions
let root: ReturnType<typeof createRoot> | undefined
const host = document.createElement("div")
function Harness() {
  actions = useAuthActions({
    setBusy: busy,
    setError: error,
    setMessage() {},
    setSession() {},
    loadSession: async () => {},
  })
  return null
}
async function mount() {
  await act(async () => {
    root = createRoot(host)
    root.render(createElement(Harness))
  })
}
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  localStorage.clear()
  busy.mockClear()
  error.mockClear()
})
test("sign-up sends credentials only to auth and never persists the password", async () => {
  await mount()
  await act(async () => {
    actions.setName("Test user")
    actions.setEmail("test@example.test")
    actions.setPassword("fixture-passphrase")
    actions.setConfirmPassword("fixture-passphrase")
  })
  await act(async () => actions.handleEmailSignUp())
  expect(signUp).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem("pendingSignInPassword")).toBeNull()
  expect(localStorage.getItem("pendingSignInEmail")).toBeNull()
  expect(actions.password).toBe("")
  expect(actions.confirmPassword).toBe("")
})
test("OAuth response errors are visible and release the busy state", async () => {
  await mount()
  await act(async () => actions.handleGoogleSignIn())
  expect(error).toHaveBeenLastCalledWith("Provider unavailable")
  expect(busy).toHaveBeenLastCalledWith(false)
})
test("legacy credentials are removed while tracker preferences remain", () => {
  localStorage.setItem("pendingSignInPassword", "fixture-old-passphrase")
  localStorage.setItem("pendingSignInEmail", "test@example.test")
  localStorage.setItem("tracker-preferences", "keep")
  clearLegacySignInCredentials()
  expect(localStorage.getItem("pendingSignInPassword")).toBeNull()
  expect(localStorage.getItem("pendingSignInEmail")).toBeNull()
  expect(localStorage.getItem("tracker-preferences")).toBe("keep")
})
