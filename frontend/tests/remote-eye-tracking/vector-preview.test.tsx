import { afterEach, expect, test } from "bun:test"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import { buildTrackingVectors } from "../../apps/web/src/features/remote-eye-tracking/tracking-vectors"
import { inspectRgbFace } from "../../apps/web/src/features/remote-eye-tracking/rgb-features"
import { face } from "./face-fixture"
if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { act, createElement, createRef } =
  await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { RemoteCameraPreview } =
  await import("../../apps/web/src/features/remote-eye-tracking/components/remote-camera-preview")
const { RemoteVectorReadout } =
  await import("../../apps/web/src/features/remote-eye-tracking/components/remote-vector-readout")
let root: ReturnType<typeof createRoot> | null = null
let host: HTMLDivElement
const geometry = inspectRgbFace(face(0.3), 640, 480)
if (!geometry.valid) throw new Error(geometry.reason)
const vectors = buildTrackingVectors(
  geometry,
  [
    [255, 199],
    [386, 203],
  ],
  "ir-pupil"
)
const observation = {
  width: 640,
  height: 480,
  timestamp: 100,
  feature: [1],
  quality: 1,
  reason: null,
  eyes: geometry.eyes,
  faceBox: geometry.faceBox,
  pose: geometry.pose,
  basePoint: [0.5, 0.5] as [number, number],
  vectors,
  method: "Vector fixture",
  processingMs: 0,
}

async function render(
  element: Parameters<NonNullable<typeof root>["render"]>[0]
) {
  if (!root) {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  }
  await act(async () => root!.render(element))
}
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  host?.remove()
})

test.each(["webcam", "mobile", "ir"] as const)(
  "%s preview shows camera-frame vectors and clears them on signal loss",
  async (mode) => {
    const props = {
      mode,
      roi: { x: 0, y: 0, width: 1, height: 1 },
      status: "ready" as const,
      replaying: false,
      selecting: false,
      videoRef: createRef<HTMLVideoElement>(),
      onPointerDown: () => {},
      onPointerUp: () => {},
      showVectors: true,
    }
    await render(createElement(RemoteCameraPreview, { ...props, observation }))
    expect(host.querySelectorAll("[data-vector]")).toHaveLength(3)
    expect(
      host.querySelector(".remote-preview")!.classList.contains("mirrored")
    ).toBe(mode !== "ir")
    const rightLine = host.querySelector('[data-vector^="right"] line')!
    expect(Number(rightLine.getAttribute("x1"))).toBeCloseTo(249.6, 8)
    expect(Number(rightLine.getAttribute("x2"))).toBeCloseTo(
      249.6 + 4 * (255 - 249.6),
      8
    )
    await render(
      createElement(RemoteCameraPreview, { ...props, observation: null })
    )
    expect(host.querySelectorAll("[data-vector]")).toHaveLength(0)
  }
)

test("hiding vectors leaves existing eye detections visible", async () => {
  await render(
    createElement(RemoteCameraPreview, {
      observation,
      mode: "webcam",
      roi: { x: 0, y: 0, width: 1, height: 1 },
      status: "ready",
      replaying: false,
      selecting: false,
      showVectors: false,
      videoRef: createRef<HTMLVideoElement>(),
      onPointerDown: () => {},
      onPointerUp: () => {},
    })
  )
  expect(host.querySelectorAll("[data-vector]")).toHaveLength(0)
  expect(host.querySelectorAll("circle")).toHaveLength(2)
})

test("numeric readout distinguishes eye movement from 3D rays and displays actual head correction", async () => {
  const props = {
    vectors,
    beforeHeadCorrection: [0.4, 0.6] as [number, number],
    afterHeadCorrection: [0.5, 0.5] as [number, number],
    headCorrectionActive: true,
  }
  await render(createElement(RemoteVectorReadout, props))
  expect(
    host.querySelector('[aria-label="Face direction vector"]')!.textContent
  ).toBe("0.296, 0.000, 0.955")
  expect(host.textContent).toContain("Face 3D · eyes 2D (×4)")
  expect(host.textContent).toContain("not calibrated 3D gaze rays")
  expect(
    host.querySelector('[aria-label="Gaze before and after head correction"]')!
      .textContent
  ).toBe("0.400, 0.600 → 0.500, 0.500")
  await render(
    createElement(RemoteVectorReadout, {
      ...props,
      vectors: null,
      beforeHeadCorrection: null,
      afterHeadCorrection: null,
    })
  )
  for (const label of [
    "Face direction vector",
    "Right eye movement vector",
    "Left eye movement vector",
  ]) {
    expect(host.querySelector(`[aria-label="${label}"]`)!.textContent).toBe("—")
  }
})

test("joint motion readout describes a single fitted gaze instead of inventing a before/after correction", async () => {
  await render(
    createElement(RemoteVectorReadout, {
      vectors,
      beforeHeadCorrection: null,
      afterHeadCorrection: [0.5, 0.5],
      headCorrectionActive: true,
      jointMotion: true,
    })
  )
  expect(
    host.querySelector('[aria-label="Gaze with joint head compensation"]')
      ?.textContent
  ).toBe("0.500, 0.500")
  expect(host.textContent).toContain("fitted together using the motion hold")
})
