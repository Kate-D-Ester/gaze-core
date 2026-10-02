/** Remove credentials persisted by older releases without reading their values. */
export function clearLegacySignInCredentials() {
  try {
    localStorage.removeItem("pendingSignInEmail")
    localStorage.removeItem("pendingSignInPassword")
  } catch {
    // Storage may be disabled. Authentication must still work through cookies.
  }
}
