import { expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import type { Point } from "../../apps/web/src/features/eye-tracking/eye-tracking.types"
if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { useGazeAdjustment } =
  await import("../../apps/web/src/features/eye-tracking/use-gaze-adjustment")
const { GazeOffsetControls } =
  await import("../../apps/web/src/features/eye-tracking/components/gaze-offset-controls")

test("session adjustments survive rerenders but reset on a new calibration or reload", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  let root = createRoot(host)
  let current: ReturnType<typeof useGazeAdjustment>
  let lastOffset: Point = [0, 0]
  function Controls({ calibration }: { calibration: object | null }) {
    current = useGazeAdjustment(calibration)
    lastOffset = current.offset
    return createElement(GazeOffsetControls, {
      offset: current.offset,
      width: 1000,
      height: 500,
      onChange: current.setOffset,
      onCorrect: () => {},
    })
  }
  const model = {}
  const render = async (calibration: object | null) => {
    await act(async () => root.render(createElement(Controls, { calibration })))
  }
  try {
    await render(model)
    await act(async () => current.setOffset([0.02, -0.04]))
    expect(
      host.querySelector('[aria-label="Correct gaze with a click"]')
    ).not.toBeNull()
    expect(host.querySelector('input[type="range"]')).toBeNull()
    await render(model)
    expect(lastOffset).toEqual([0.02, -0.04])
    await render(null)
    await render(model)
    expect(lastOffset).toEqual([0, 0])
    await act(async () => current.setOffset([0.02, -0.04]))
    await render({})
    expect(lastOffset).toEqual([0, 0])
    await act(async () => current.setOffset([0.02, -0.04]))
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Reset gaze offset"]')!
        .click()
    )
    expect(lastOffset).toEqual([0, 0])
    await act(async () => current.setOffset([0.02, -0.04]))
    await act(async () => root.unmount())
    root = createRoot(host)
    await render(model)
    expect(lastOffset).toEqual([0, 0])
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
