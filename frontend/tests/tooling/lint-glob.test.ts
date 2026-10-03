import { expect, test } from "bun:test"
import { createRequire } from "node:module"

test("the installed ESLint matcher handles source extension braces", () => {
  const requireWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url))
  const requireLint = createRequire(requireWeb.resolve("eslint"))
  const { Minimatch } = requireLint("minimatch")
  const matcher = new Minimatch("src/**/*.{ts,tsx}")
  expect(matcher.match("src/features/speaker-focus/client.ts")).toBe(true)
  expect(matcher.match("src/features/speaker-focus/workspace.tsx")).toBe(true)
  expect(matcher.match("src/styles.css")).toBe(false)
})
