import { expect, test } from "bun:test"
import { startOptionalGyroSubscription } from "./gaze-websocket"

test("starts optional gyro subscription without blocking websocket readiness", async () => {
  let resolveSubscription!: (release: () => void) => void
  let ready = false

  const subscription = new Promise<() => void>((resolve) => {
    resolveSubscription = resolve
  })

  startOptionalGyroSubscription(
    () => subscription,
    () => {
      ready = true
    },
    () => {},
  )

  expect(ready).toBe(false)

  resolveSubscription(() => {})
  await subscription
  await Promise.resolve()

  expect(ready).toBe(true)
})
