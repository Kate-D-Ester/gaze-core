import { afterEach, expect, test } from "bun:test"
import { GET } from "../../apps/web/src/app/runtime-config.js/route"

const original = process.env.GAZECORE_BACKEND_URL
const privateMarker = process.env.AUTH_PRIVATE_TEST_MARKER
const originalLegacy = process.env.VITE_GAZECORE_BACKEND_URL
const originalPublic = process.env.NEXT_PUBLIC_GAZECORE_BACKEND_URL
afterEach(() => {
  if (originalLegacy === undefined) {
    delete process.env.VITE_GAZECORE_BACKEND_URL
  } else {
    process.env.VITE_GAZECORE_BACKEND_URL = originalLegacy
  }
  if (originalPublic === undefined) {
    delete process.env.NEXT_PUBLIC_GAZECORE_BACKEND_URL
  } else {
    process.env.NEXT_PUBLIC_GAZECORE_BACKEND_URL = originalPublic
  }
  if (original === undefined) {
    delete process.env.GAZECORE_BACKEND_URL
  } else {
    process.env.GAZECORE_BACKEND_URL = original
  }
  if (privateMarker === undefined) {
    delete process.env.AUTH_PRIVATE_TEST_MARKER
  } else {
    process.env.AUTH_PRIVATE_TEST_MARKER = privateMarker
  }
})

test("runtime configuration exposes only the public backend base URL", async () => {
  process.env.GAZECORE_BACKEND_URL = "https://auth.example.test/"
  process.env.AUTH_PRIVATE_TEST_MARKER = "private-test-marker"
  const response = GET()
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")
  const script = await response.text()
  expect(script).toContain('"backendBaseUrl":"https://auth.example.test"')
  expect(script).not.toContain("private-test-marker")
})

test("credentials, token queries and script URLs cannot enter the public configuration", async () => {
  for (const url of [
    "https://name:pass@example.test",
    "https://example.test/?token=example",
    "javascript:alert(1)",
    "not-a-url",
  ]) {
    process.env.GAZECORE_BACKEND_URL = url
    const response = GET()
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain(url)
  }
})


test("legacy runtime configuration takes precedence over the public build fallback", async () => {
  delete process.env.GAZECORE_BACKEND_URL
  process.env.VITE_GAZECORE_BACKEND_URL = "https://legacy-runtime.example.test"
  process.env.NEXT_PUBLIC_GAZECORE_BACKEND_URL = "https://build-fallback.example.test"
  const script = await GET().text()
  expect(script).toContain("https://legacy-runtime.example.test")
  expect(script).not.toContain("https://build-fallback.example.test")
})
