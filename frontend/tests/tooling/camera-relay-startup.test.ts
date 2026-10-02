import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

test("relay startup, reuse and occupied-port handling use the native Bun server", async () => {
  // Browser tests replace Response and fetch. Keep server checks in a clean runtime.
  const fixture = fileURLToPath(
    new URL("./fixtures/camera-relay-startup.ts", import.meta.url)
  )
  const child = Bun.spawn([process.execPath, fixture], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, output, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  expect(exitCode, errors).toBe(0)
  expect(output).toContain("Using the camera relay already running")
})
