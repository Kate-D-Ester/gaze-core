import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement } from "../../apps/web/node_modules/react"
import {
  createRoot,
  type Root,
} from "../../apps/web/node_modules/react-dom/client"
import { V2StepNavigation } from "../../apps/web/src/features/eye-tracking/components/v2-step-navigation"
import { V2StepPanel } from "../../apps/web/src/features/eye-tracking/components/v2-step-panel"
import { PipelinePreviews } from "../../apps/web/src/features/eye-tracking/components/pipeline-previews"
import { SpherePreview } from "../../apps/web/src/features/eye-tracking/components/sphere-preview"

if (typeof document === "undefined") GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
const host = document.createElement("div")

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  host.replaceChildren()
  host.remove()
})

test("step navigation marks completion, gates unavailable steps, and selects a step", async () => {
  const selected: number[] = []
  document.body.append(host)

  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(V2StepNavigation, {
        steps: ["Camera", "Eye region", "Eye model"],
        activeStep: 1,
        completedSteps: new Set([0]),
        availableSteps: new Set([0, 1]),
        onSelectStep: (step: number) => selected.push(step),
      })
    )
  })

  const buttons = host.querySelectorAll<HTMLButtonElement>(".eye-step")
  expect(buttons).toHaveLength(3)
  expect(buttons[0]?.classList.contains("done")).toBe(true)
  expect(buttons[1]?.getAttribute("aria-current")).toBe("step")
  expect(buttons[2]?.disabled).toBe(true)
  expect(buttons[2]?.classList.contains("done")).toBe(false)

  await act(async () => buttons[0]?.click())
  expect(selected).toEqual([0])
})

test("step panel exposes the active step and readable error feedback", async () => {
  document.body.append(host)

  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(
        V2StepPanel,
        {
          stepName: "Eye model",
          description: "Look around the full range.",
          error: "Pupil not detected",
        },
        createElement("button", null, "Lock model")
      )
    )
  })

  expect(host.querySelector("aside.eye-controls")).not.toBeNull()
  expect(host.querySelector("aside.eye-controls h2")?.textContent).toBe(
    "Eye model"
  )
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "Pupil not detected"
  )
  expect(host.querySelector(".eye-controls-body button")?.textContent).toBe(
    "Lock model"
  )
})

test("pipeline and eye model previews retain empty-state labels and metrics", async () => {
  document.body.append(host)

  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(
        "div",
        null,
        createElement(PipelinePreviews, { frame: null }),
        createElement(SpherePreview, { frame: null })
      )
    )
  })

  expect(
    Array.from(
      host.querySelectorAll(
        ".eye-thumbnail > div:last-child > span:first-child"
      ),
      (label) => label.textContent
    )
  ).toEqual(["Strict", "Balanced", "Relaxed"])
  expect(host.querySelector(".eye-section-label")?.textContent).toContain(
    "Collecting"
  )
  expect(host.querySelector(".eye-sphere-metrics")?.textContent).toContain(
    "observations"
  )
})
