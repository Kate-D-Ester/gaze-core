import { afterEach, beforeEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { act, createElement } from "../../apps/web/node_modules/react"
import {
  createRoot,
  type Root,
} from "../../apps/web/node_modules/react-dom/client"
import { ModelControls } from "../../apps/web/src/features/eye-tracking/steps/model-controls"
import { DEFAULT_SETTINGS } from "../../apps/web/src/features/eye-tracking/use-tracker"
import type { TrackerController } from "../../apps/web/src/features/eye-tracking/use-tracker.types"

if (typeof document === "undefined") GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root | null

const tracker = {
  settings: { ...DEFAULT_SETTINGS, format: "classic" },
  dimensions: { width: 640, height: 480 },
  frame: null,
} as TrackerController

function modelControls(
  corner: [number, number] | null,
  currentTracker: TrackerController = tracker
) {
  return createElement(ModelControls, {
    tracker: currentTracker,
    corner,
    update: () => {},
    setNotice: () => {},
  })
}

function renderModelControls() {
  root = createRoot(host)
  root.render(modelControls(null))
}

beforeEach(async () => {
  HTMLCanvasElement.prototype.getContext = (() => null) as any
  host = document.createElement("div")
  document.body.append(host)
  await act(async () => renderModelControls())
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  host.remove()
})

test("manual corner help opens on tap, dismisses with Escape, and remains available on re-entry", async () => {
  const help = host.querySelector<HTMLButtonElement>(
    '[aria-label="Manual eye model help"]'
  )!
  const tip = help.closest(".eye-help-tip")!
  const description = host.querySelector(
    `#${help.getAttribute("aria-describedby")}`
  )!
  expect(description.getAttribute("role")).toBe("tooltip")
  expect(description.textContent).toContain("drag a red + to resize")
  expect(description.textContent).toContain("drag inside the circle to move")
  expect(tip.hasAttribute("data-open")).toBe(false)
  await act(async () => help.click())
  expect(tip.hasAttribute("data-open")).toBe(true)
  const floating = document.querySelector(".eye-floating-tooltip")
  expect(floating).not.toBeNull()
  expect(floating?.parentElement).toBe(document.body)
  expect(floating?.textContent).toContain("drag a red + to resize")
  await act(async () =>
    help.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  )
  expect(tip.hasAttribute("data-open")).toBe(false)
  expect(tip.hasAttribute("data-dismissed")).toBe(true)
  expect(document.querySelector(".eye-floating-tooltip")).toBeNull()
  await act(async () => help.click())
  expect(tip.hasAttribute("data-open")).toBe(true)
  expect(tip.hasAttribute("data-dismissed")).toBe(false)

  await act(async () => root?.unmount())
  root = null
  await act(async () => renderModelControls())
  expect(
    host.querySelector('[aria-label="Manual eye model help"]')
  ).not.toBeNull()
  expect(host.querySelector(".eye-help-tip")?.hasAttribute("data-open")).toBe(
    false
  )
})

test("manual corner status announces that point 2 is next", async () => {
  await act(async () => root?.render(modelControls([220, 180])))

  const status = host.querySelector('[role="status"]')
  expect(status).not.toBeNull()
  expect(status?.textContent).toBe("Pick the opposite corner.")
})

test("auto model guidance says how many more directions are needed", async () => {
  const spatialTracker = {
    ...tracker,
    settings: { ...DEFAULT_SETTINGS, format: "spatial" as const },
    frame: {
      width: 640,
      height: 480,
      roi: { x: 0, y: 0, width: 204, height: 122 },
      model: {
        center: [320, 240],
        radius: 40,
        residual: 5.7,
        samples: 96,
        coverage: 0.25,
        ready: false,
      },
    },
  } as TrackerController

  await act(async () => root?.render(modelControls(null, spatialTracker)))

  expect(host.textContent).toContain("Explore a few directions.")
  expect(host.textContent).toContain("1 more distinct direction")
})
