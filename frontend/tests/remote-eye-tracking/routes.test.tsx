import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { RemoteEyeTrackingPage } = await import("../../apps/web/src/screens/remote-eye-tracking-page")
const { default: nextConfig } = await import("../../apps/web/next.config")
let root: ReturnType<typeof createRoot> | null = null
let host: HTMLDivElement
const buttons = () => [...host.querySelectorAll("button")]
async function render() {
  host = document.createElement("div")
  document.body.append(host)
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(RemoteEyeTrackingPage)
    )
  })
}
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  host?.remove()
})
test("the remote route is public and offers all three camera choices before requesting a camera", async () => {
  await render()
  expect(host.querySelector("h1")?.textContent).toBe("Remote eye tracking")
  expect(
    buttons().filter((button) => button.classList.contains("remote-mode-card"))
  ).toHaveLength(3)
  for (const title of [
    "Mobile eye tracker",
    "Webcam-based eye tracker",
    "IR webcam-based eye tracker",
  ])
    expect(
      buttons().some((button) => button.getAttribute("aria-label") === title)
    ).toBe(true)
  expect(host.querySelector("video")?.srcObject).toBeNull()
  await act(async () =>
    buttons()
      .find(
        (button) => button.getAttribute("aria-label") === "Mobile eye tracker"
      )!
      .click()
  )
  expect(
    host.querySelector<HTMLButtonElement>(
      'button[aria-label="Check your position"]'
    )?.disabled
  ).toBe(true)
  expect(host.textContent).toContain("HTTPS")
  expect(host.textContent).toContain("Live head tracking")
})
test("changing the camera concept replaces its instructions and motion reference", async () => {
  await render()
  await act(async () =>
    buttons()
      .find(
        (button) =>
          button.getAttribute("aria-label") === "IR webcam-based eye tracker"
      )!
      .click()
  )
  expect(host.textContent).toContain("Live head tracking")
  expect(host.textContent).toContain("Eyes and pupil thresholds are automatic")
  await act(async () =>
    buttons()
      .find((button) => button.textContent === "Change setup")!
      .click()
  )
  expect(
    buttons().filter((button) => button.classList.contains("remote-mode-card"))
  ).toHaveLength(3)
  await act(async () =>
    buttons()
      .find(
        (button) =>
          button.getAttribute("aria-label") === "Webcam-based eye tracker"
      )!
      .click()
  )
  expect(host.textContent).toContain("Live head tracking")
  expect(host.textContent).toContain("camera above your screen")
})
test("legacy tracker aliases permanently redirect to canonical Next routes", async () => {
  expect(await nextConfig.redirects?.()).toEqual([
    { source: "/v2", destination: "/trial/screen-eye-tracking", permanent: true },
    { source: "/trial", destination: "/trial/screen-eye-tracking", permanent: true },
    { source: "/trials", destination: "/trial/screen-eye-tracking", permanent: true },
    { source: "/trials/remote-eye-tracking", destination: "/trial/remote-eye-tracking", permanent: true },
  ])
})

test.each([
  ["screen-eye-tracking", "screen"],
  ["remote-eye-tracking", "remote"],
  ["scene-camera-eye-tracking", "scene"],
])("Next route %s selects the %s browser tracker", async (route, mode) => {
  const source = await Bun.file(new URL(`../../apps/web/src/app/trial/${route}/page.tsx`, import.meta.url)).text()
  expect(source).toContain(`<TrackingClient mode="${mode}" />`)
  expect(source).not.toContain("Auth")
})

test("camera screens load behind a client boundary without server rendering", async () => {
  const source = await Bun.file(new URL("../../apps/web/src/components/tracking-client.tsx", import.meta.url)).text()
  expect(source).toMatch(/^"use client"/)
  expect(source.match(/ssr: false/g)).toHaveLength(2)
})

test("resizing before choosing a setup leaves all camera cards available", async () => {
  await render()
  await act(async () => window.dispatchEvent(new Event("resize")))
  expect(
    buttons().filter((button) => button.classList.contains("remote-mode-card"))
  ).toHaveLength(3)
  expect(host.querySelector(".remote-workspace")?.hasAttribute("hidden")).toBe(
    true
  )
})

// A camera list must be reachable without connecting the default camera first.
test("camera selection and permission unlock are available before tracking starts", async () => {
  await render()
  await act(async () =>
    buttons()
      .find(
        (b) => b.getAttribute("aria-label") === "IR webcam-based eye tracker"
      )!
      .click()
  )
  expect(host.querySelector('select[aria-label="Camera"]')).not.toBeNull()
  expect(
    buttons().some((b) => b.getAttribute("aria-label") === "Discover cameras")
  ).toBe(true)
  expect(host.querySelector("video")?.srcObject).toBeNull()
})

test.each([
  "Mobile eye tracker",
  "Webcam-based eye tracker",
  "IR webcam-based eye tracker",
])(
  "the setup back arrow returns %s to camera choices while dashboard navigation stays separate",
  async (title) => {
    await render()
    await act(async () => {
      buttons()
        .find((button) => button.getAttribute("aria-label") === title)!
        .click()
    })
    const back = host.querySelector<HTMLButtonElement>(
      '.remote-page-heading button[aria-label="Back to camera choices"]'
    )
    expect(back).not.toBeNull()
    expect(host.querySelector("a.eye-brand")?.getAttribute("href")).toBe(
      "/dashboard"
    )
    await act(async () => back!.click())
    expect(host.querySelector("h1")?.textContent).toBe("Remote eye tracking")
    expect(host.querySelectorAll(".remote-mode-card")).toHaveLength(3)
    expect(
      host.querySelector(".remote-workspace")?.hasAttribute("hidden")
    ).toBe(true)
    expect(
      host
        .querySelector('.remote-page-heading a[aria-label="Dashboard"]')
        ?.getAttribute("href")
    ).toBe("/dashboard")
  }
)
