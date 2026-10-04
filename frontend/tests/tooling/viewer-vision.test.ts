import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

// DOM component suites replace global Request/Response. Exercise the server boundary
// with native HTTP in a subprocess, as the existing network-camera test does.
async function verify(scenario: string) {
  const fixture = fileURLToPath(
    new URL("./fixtures/viewer-vision.ts", import.meta.url)
  )
  const child = Bun.spawn([process.execPath, fixture, scenario], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, output, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  expect(code, output + errors).toBe(0)
}
test("vision bridge rejects cross-origin and oversized requests before inference", () =>
  verify("validation"))
test("vision bridge forwards supported actions to the authenticated loopback service", () =>
  verify("forward"))
test("missing local service produces an actionable error", () =>
  verify("missing"))
