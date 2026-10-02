import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { MemoryRouter } =
  await import("../../apps/web/node_modules/react-router-dom")
const { useLocation } =
  await import("../../apps/web/node_modules/react-router-dom")
const { ThemeProvider } =
  await import("../../apps/web/src/components/theme-provider")
const { V2Page } = await import("../../apps/web/src/pages/v2-page")
const { App } = await import("../../apps/web/src/App")
const { DashboardPage } =
  await import("../../apps/web/src/pages/dashboard-page")

const host = document.createElement("div")
let root: ReturnType<typeof createRoot>

function CurrentPath() {
  const location = useLocation()
  return createElement(
    "output",
    { "data-testid": "current-path" },
    location.pathname
  )
}

function renderAppAtPath(path: string) {
  root = createRoot(host)
  root.render(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(App),
      createElement(CurrentPath)
    )
  )
}
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
  expect(host.querySelectorAll(".eye-step-chevron")).toHaveLength(5)
  const stepNames = Array.from(
    host.querySelectorAll(".eye-step-nav button"),
    (button) => button.textContent
  )
  expect(stepNames).toEqual([
    "01Camera",
    "02Eye region",
    "03Eye model",
    "04Head tracker",
    "05Calibrate",
    "06Live gaze",
  ])
  expect(host.querySelectorAll(".eye-viewfinder-corner")).toHaveLength(0)
})

test("the public tracker opens at /trial/screen-eye-tracking and redirects /v2 links there", async () => {
  ;(globalThis as any).Worker = class {
    postMessage() {}
    terminate() {}
  }
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
  document.body.append(host)

  await act(async () => renderAppAtPath("/trial/screen-eye-tracking"))
  expect(host.querySelector(".eye-app")).not.toBeNull()
  expect(host.querySelector('[data-testid="current-path"]')?.textContent).toBe(
    "/trial/screen-eye-tracking"
  )

  await act(async () => root.unmount())
  host.replaceChildren()
  await act(async () => renderAppAtPath("/v2"))
  expect(host.querySelector(".eye-app")).not.toBeNull()
  expect(host.querySelector('[data-testid="current-path"]')?.textContent).toBe(
    "/trial/screen-eye-tracking"
  )
})

test("dashboard offers exactly three trial cards with working navigation", async () => {
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/dashboard"] },
        createElement(DashboardPage, {
          session: { user: { id: "user-1", email: "kate@example.com" } },
          busy: false,
          loadingKeys: false,
          apiKeys: [],
          newKeyName: "",
          createdApiKey: "",
          message: "",
          error: "",
          onSignOut() {},
          onNewKeyNameChange() {},
          onCreateKey() {},
          onCopyCreatedKey() {},
          onRegenerateKey() {},
          onDeleteKey() {},
        }),
        createElement(CurrentPath)
      )
    )
  })

  expect(host.querySelector("header")?.textContent).not.toContain("Try it out")
  const expected = [
    ["Screen eye tracking", "/trial/screen-eye-tracking"],
    ["Remote eye tracking", "/trial/remote-eye-tracking"],
    ["Scene camera eye tracking", "/trial/scene-camera-eye-tracking"],
  ]
  expect(host.querySelectorAll("article")).toHaveLength(3)
  for (const [name, path] of expected) {
    const card = host.querySelector(`article[aria-label="${name}"]`)!
    const link = card.querySelector<HTMLAnchorElement>("a")!
    expect(card.querySelector("h3")?.textContent).toBe(name)
    expect(link.textContent).toContain("Try it out")
    expect(link.getAttribute("href")).toBe(path)
    await act(async () => link.click())
    expect(
      host.querySelector('[data-testid="current-path"]')?.textContent
    ).toBe(path)
  }
})
