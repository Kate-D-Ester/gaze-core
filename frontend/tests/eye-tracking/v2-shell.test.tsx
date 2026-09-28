import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { MemoryRouter } =
  await import("../../apps/web/node_modules/react-router-dom")
const { ThemeProvider } =
  await import("../../apps/web/src/components/theme-provider")
const { V2Page } = await import("../../apps/web/src/pages/v2-page")

const host = document.createElement("div")
let root: ReturnType<typeof createRoot>
afterEach(async () => {
  if (root) await act(async () => root.unmount())
  host.remove()
  document.documentElement.classList.remove("light", "dark")
  localStorage.removeItem("v2-shell-test-theme")
  localStorage.removeItem("gazecore-theme")
  localStorage.removeItem("theme")
})

test("the app defaults to dark even when an old light preference exists", async () => {
  localStorage.setItem("theme", "light")
  ;(window as any).matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(ThemeProvider, null, createElement("div", null, "app"))
    )
  })
  expect(document.documentElement.classList.contains("dark")).toBe(true)
  expect(document.documentElement.classList.contains("light")).toBe(false)
})

test("V2 keeps its dark camera workspace surface and native controls", async () => {
  ;(globalThis as any).Worker = class {
    postMessage() {}
    terminate() {}
  }
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(
        ThemeProvider,
        {
          defaultTheme: "light",
          storageKey: "v2-shell-test-theme",
          disableTransitionOnChange: false,
        },
        createElement(MemoryRouter, null, createElement(V2Page))
      )
    )
  })
  const app = host.querySelector<HTMLElement>(".eye-app")!
  expect(document.documentElement.classList.contains("light")).toBe(true)
  expect(app.style.colorScheme).toBe("dark")
  expect(app.style.backgroundColor).toBe("#090909")
})

test("threshold and preview render as separate sibling cards", async () => {
  ;(globalThis as any).Worker = class {
    postMessage() {}
    terminate() {}
  }
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(
        ThemeProvider,
        {
          defaultTheme: "light",
          storageKey: "v2-shell-test-theme",
          disableTransitionOnChange: false,
        },
        createElement(MemoryRouter, null, createElement(V2Page))
      )
    )
  })
  const column = host.querySelector<HTMLElement>(".eye-preview-column")!
  const thresholdCard = column.querySelector<HTMLElement>(
    ".eye-threshold-controls"
  )!
  const previewCard = column.querySelector<HTMLElement>(".eye-preview-card")!
  const comparison = previewCard.querySelector<HTMLElement>(
    ".eye-pipeline-details"
  )
  expect(thresholdCard.parentElement).toBe(column)
  expect(previewCard.parentElement).toBe(column)
  expect(previewCard.querySelector(".eye-preview")).not.toBeNull()
  expect(comparison).not.toBeNull()
  expect(comparison?.parentElement).toBe(previewCard)
  expect(comparison?.hidden).toBe(true)
  expect(comparison?.querySelectorAll(".eye-thumbnail")).toHaveLength(0)
  expect(thresholdCard.contains(previewCard)).toBe(false)
  expect(host.querySelectorAll(".eye-step-chevron")).toHaveLength(4)
  expect(host.querySelectorAll(".eye-viewfinder-corner")).toHaveLength(0)
})
