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

test("manual corner help can be opened and dismissed without hiding the next action", async () => {
  expect(host.textContent).toContain("Choose Create and click the inner")
  expect(host.textContent).toContain("drag a + endpoint to resize the circle")
  expect(host.textContent).toContain("drag inside it to move the model")

  const help = host.querySelector<HTMLButtonElement>(
    '[aria-label="Manual eye model help"]'
  )
  expect(help?.getAttribute("aria-expanded")).toBe("false")
  await act(async () => help?.click())
  expect(help?.getAttribute("aria-expanded")).toBe("true")
  await act(async () =>
    help?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  )
  expect(help?.getAttribute("aria-expanded")).toBe("false")
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    "Click the inner, then outer eye corner"
  )
})

test("manual corner status announces that point 2 is next", async () => {
  await act(async () => root?.render(modelControls([220, 180])))

  const status = host.querySelector('[role="status"]')
  expect(status).not.toBeNull()
  expect(status?.textContent).toContain("opposite eye corner")
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
