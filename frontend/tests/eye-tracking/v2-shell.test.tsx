import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { ThemeProvider } =
  await import("../../apps/web/src/components/theme-provider")
const { EyeTrackingWorkspace } =
  await import("../../apps/web/src/screens/eye-tracking-workspace")
const { default: nextConfig } = await import("../../apps/web/next.config")
const { DashboardPage } =
  await import("../../apps/web/src/screens/dashboard-page")

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

test("typing D outside a field cannot silently switch the app to light", async () => {
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(ThemeProvider, null, createElement("div", null, "app"))
    )
  })
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }))
  })
  expect(document.documentElement.classList.contains("dark")).toBe(true)
  expect(localStorage.getItem("gazecore-theme")).not.toBe("light")
})

test("the fixed app theme ignores a previously saved light preference", async () => {
  localStorage.setItem("gazecore-theme", "light")
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(
        ThemeProvider,
        { forcedTheme: "dark" },
        createElement("div", null, "app")
      )
    )
  })
  expect(document.documentElement.classList.contains("dark")).toBe(true)
  await act(async () => {
    window.dispatchEvent(
      new StorageEvent("storage", { key: "gazecore-theme", newValue: "light" })
    )
  })
  expect(document.documentElement.classList.contains("dark")).toBe(true)
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
        createElement(EyeTrackingWorkspace)
      )
    )
  })
  const app = host.querySelector<HTMLElement>(".eye-app")!
  expect(document.documentElement.classList.contains("light")).toBe(true)
  expect(app.classList.contains("[color-scheme:dark]")).toBe(true)
  expect(app.classList.contains("bg-[#090909]")).toBe(true)
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
        createElement(EyeTrackingWorkspace)
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

test("the screen tracker has a public Next page and a permanent v2 redirect", async () => {
  const source = await Bun.file(
    new URL(
      "../../apps/web/src/app/trial/screen-eye-tracking/page.tsx",
      import.meta.url
    )
  ).text()
  expect(source).toContain(`<TrackingClient mode="screen" />`)
  expect(
    (await nextConfig.redirects?.())?.find((route) => route.source === "/v2")
  ).toEqual({
    source: "/v2",
    destination: "/trial/screen-eye-tracking",
    permanent: true,
  })
})

test("dashboard offers exactly three trial cards with working navigation", async () => {
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
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
      })
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
  }
})
