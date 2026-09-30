import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
import { act, createElement } from "../../apps/web/node_modules/react"
import {
  createRoot,
  type Root,
} from "../../apps/web/node_modules/react-dom/client"
import { MemoryRouter } from "../../apps/web/node_modules/react-router-dom"
import { App } from "../../apps/web/src/App"
let root: Root | null = null,
  host: HTMLDivElement
async function render(path: string) {
  ;(globalThis as any).Worker = class {
    postMessage() {}
    terminate() {}
  }
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
  host = document.createElement("div")
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(App)
      )
    )
  })
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = null
  host?.remove()
})
test("scene-camera trial is public and shares both v2 eye formats and its first three steps", async () => {
  await render("/trial/scene-camera-eye-tracking")
  expect(host.querySelector("h1")?.textContent).toBe(
    "Scene camera eye tracking"
  )
  const steps = [...host.querySelectorAll(".eye-step-text")].map(
    (e) => e.textContent
  )
  expect(steps).toEqual([
    "Camera",
    "Eye region",
    "Eye model",
    "Scene camera",
    "Finger calibration",
    "Live scene gaze",
  ])
  const formats = [
    ...host.querySelectorAll<HTMLButtonElement>(".eye-formats button"),
  ]
  expect(formats).toHaveLength(2)
  await act(async () => formats[0].click())
  expect(formats[0].getAttribute("aria-pressed")).toBe("true")
})
test("original trial retains its screen-calibration workflow", async () => {
  await render("/trial")
  expect(host.querySelector("h1")?.textContent).toBe("Eye tracking")
  expect(
    [...host.querySelectorAll(".eye-step-text")].map((e) => e.textContent)
  ).toEqual(["Camera", "Eye region", "Eye model", "Calibrate", "Live gaze"])
})

test("eye and scene panels each reference their own unique heading", async () => {
  await render("/trial/scene-camera-eye-tracking")
  const panels = [...host.querySelectorAll("aside.eye-controls")]
  expect(panels).toHaveLength(2)
  const ids = panels.map((panel) => panel.getAttribute("aria-labelledby"))
  expect(new Set(ids).size).toBe(2)
  for (const panel of panels) {
    expect(panel.querySelector("h2")?.id).toBe(
      panel.getAttribute("aria-labelledby")
    )
  }
})
