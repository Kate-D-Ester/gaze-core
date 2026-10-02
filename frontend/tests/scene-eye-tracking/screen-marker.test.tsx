import { expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
if (typeof document === "undefined") GlobalRegistrator.register()
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { ScreenCalibrationMarker } =
  await import("../../apps/web/src/features/scene-eye-tracking/screen-calibration-marker")
const { SetupStepPanel } =
  await import("../../apps/web/src/features/eye-tracking/components/setup-step-panel")
test("a same-page marker is separate from changing controls, and its size cannot change during a hold", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const render = (capturing: boolean, message = "") =>
    createElement(SetupStepPanel, {
      stepName: "Calibration",
      description: "Look at the red center",
      message,
      stage: createElement(ScreenCalibrationMarker, { capturing }),
      children: createElement("button", {}, capturing ? "Cancel" : "Calibrate"),
    })
  try {
    await act(async () => root.render(render(false)))
    const image = host.querySelector<HTMLImageElement>(
      ".screen-calibration-marker"
    )!
    expect(decodeURIComponent(image.src)).toContain(
      '<circle cx="50" cy="50" r="42"'
    )
    expect(image.closest(".eye-controls-body")).toBeNull()
    const smaller = host.querySelector<HTMLButtonElement>(
      '[aria-label="Smaller marker"]'
    )!
    await act(async () => smaller.click())
    const size = image.style.getPropertyValue("--marker-scale")
    expect(size).toBe("0.9")
    await act(async () => root.render(render(true, "Capturing…")))
    expect(host.querySelector(".screen-calibration-marker")).toBe(image)
    expect(smaller.disabled).toBe(true)
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="Larger marker"]')
        ?.disabled
    ).toBe(true)
    await act(async () => smaller.click())
    expect(image.style.getPropertyValue("--marker-scale")).toBe(size)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
