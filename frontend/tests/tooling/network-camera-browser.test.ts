import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

test("direct camera streams follow native redirects without an app endpoint", async () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/network-camera-browser.ts", import.meta.url)
  )
  const child = Bun.spawn([process.execPath, fixture], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, errors, output] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ])
  expect(exitCode, errors + output).toBe(0)
})
