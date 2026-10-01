import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { MemoryRouter } =
  await import("../../apps/web/node_modules/react-router-dom")
const { App } = await import("../../apps/web/src/App")
let root: ReturnType<typeof createRoot> | null = null
let host: HTMLDivElement
const buttons = () => [...host.querySelectorAll("button")]
async function render(path: string) {
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
  if (root) await act(async () => root?.unmount())
  root = null
  host?.remove()
})
test("the remote route is public and offers all three camera choices before requesting a camera", async () => {
  await render("/trials/remote-eye-tracking")
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
  await render("/trials/remote-eye-tracking")
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
test("the normal trials alias exposes the remote tracker entry point", async () => {
  await render("/trials")
  expect(
    host.querySelector('a[href="/trials/remote-eye-tracking"]')?.textContent
  ).toBe("Remote eye tracking")
})

test("resizing before choosing a setup leaves all camera cards available", async () => {
  await render("/trials/remote-eye-tracking")
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
  await render("/trials/remote-eye-tracking")
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
