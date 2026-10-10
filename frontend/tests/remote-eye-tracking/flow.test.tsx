import { expect, spyOn, test } from "bun:test"
import {
  buildRgbFeatures,
  inspectRgbFace,
} from "../../apps/web/src/features/remote-eye-tracking/rgb-features"
import { face } from "./face-fixture"
import { saveCalibrationProfile } from "../../apps/web/src/features/tracking-calibration/calibration-profiles"
import { GlobalRegistrator } from "../../apps/web/node_modules/@happy-dom/global-registrator"
import type {
  CalibrationSample,
  RemoteObservation,
  RemoteRequest,
} from "../../apps/web/src/features/remote-eye-tracking/remote-eye-tracking.types"
if (typeof document === "undefined") GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { act, createElement } = await import("../../apps/web/node_modules/react")
const { createRoot } =
  await import("../../apps/web/node_modules/react-dom/client")
const { RemoteEyeTrackingPage } =
  await import("../../apps/web/src/screens/remote-eye-tracking-page")

test.each([
  [false, "fixture-webcam", "Webcam-based eye tracker"],
  [true, "fixture-webcam", "Webcam-based eye tracker"],
  [false, "", "Webcam-based eye tracker"],
  [true, "", "Webcam-based eye tracker"],
  [false, "fixture-ir", "IR webcam-based eye tracker"],
  [true, "fixture-mobile", "Mobile eye tracker"],
  [true, "fixture-webcam-head", "Webcam-based eye tracker", true],
] as const)(
  "unified capture, independent accuracy, and resize recovery (network readings: %p, camera identity: %p)",
  async (networkReadings, cameraId, modeTitle, includeHeadMovement = false) => {
    const reloadProfile = networkReadings && cameraId === "fixture-webcam"
    const cancelValidationPrompt = cameraId === "fixture-ir"
    window.localStorage.clear()
    let clock = 100,
      id = 0,
      stopped = 0,
      ended: (() => void) | undefined
    let missingBasePoint = false
    let movedOutsideCheckedPose = false
    let gazeError = 0
    let missingEyes = false
    let collectHeadMotion = true
    const frames = new Map<number, FrameRequestCallback>()
    const originalNow = performance.now
    const originalRequest = globalThis.requestAnimationFrame,
      originalCancel = globalThis.cancelAnimationFrame
    const originalWorker = globalThis.Worker,
      originalCapture = globalThis.createImageBitmap
    const mediaDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "mediaDevices"
    )
    const secureDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "isSecureContext"
    )
    const originalPlay = HTMLVideoElement.prototype.play,
      originalPause = HTMLVideoElement.prototype.pause
    const sourceDescriptor = Object.getOwnPropertyDescriptor(
      HTMLVideoElement.prototype,
      "srcObject"
    )
    const timeDescriptor = Object.getOwnPropertyDescriptor(
      HTMLVideoElement.prototype,
      "currentTime"
    )
    const widthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLVideoElement.prototype,
      "videoWidth"
    )
    const readyDescriptor = Object.getOwnPropertyDescriptor(
      HTMLVideoElement.prototype,
      "readyState"
    )
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const buttons = () => [...host.querySelectorAll("button")]
    const click = async (text: string) =>
      act(async () => {
        const capture = host.querySelector(".remote-calibration")
        const availableButtons = capture
          ? [...capture.querySelectorAll("button")]
          : buttons()
        const button = availableButtons.find((b) =>
          (b.getAttribute("aria-label") ?? b.textContent)?.includes(text)
        )
        expect(button).toBeDefined()
        expect(button!.disabled).toBe(false)
        button!.click()
      })
    const exportResult = async () => {
      const exported: Blob[] = []
      const download = spyOn(URL, "createObjectURL").mockImplementation(
        (blob) => {
          exported.push(blob as Blob)
          return "blob:head-calibration-diagnostic"
        }
      )
      const anchorClick = spyOn(
        HTMLAnchorElement.prototype,
        "click"
      ).mockImplementation(() => {})
      try {
        await click("Export results")
        return JSON.parse(await exported[0]!.text())
      } finally {
        download.mockRestore()
        anchorClick.mockRestore()
      }
    }
    try {
      performance.now = () => clock
      globalThis.requestAnimationFrame = (callback) => {
        frames.set(++id, callback)
        return id
      }
      globalThis.cancelAnimationFrame = (value) => {
        frames.delete(value)
      }
      Object.defineProperty(globalThis, "isSecureContext", {
        configurable: true,
        value: true,
      })
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => ({
            getTracks: () => [{ stop: () => stopped++ }],
            getVideoTracks: () => [
              {
                getSettings: () => ({ deviceId: cameraId }),
                addEventListener: (_event: string, cb: () => void) => {
                  ended = cb
                },
              },
            ],
          }),
          enumerateDevices: async () => [],
        },
      })
      Object.defineProperty(HTMLVideoElement.prototype, "srcObject", {
        configurable: true,
        writable: true,
        value: null,
      })
      HTMLVideoElement.prototype.play = async () => {}
      HTMLVideoElement.prototype.pause = () => {}
      Object.defineProperty(HTMLVideoElement.prototype, "currentTime", {
        configurable: true,
        get: () => clock / 1000,
      })
      Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
        configurable: true,
        get: () => 640,
      })
      Object.defineProperty(HTMLVideoElement.prototype, "readyState", {
        configurable: true,
        get: () => 4,
      })
      globalThis.createImageBitmap = (async () => ({
        close: () => {},
      })) as typeof createImageBitmap
      const makeObservation = (): RemoteObservation => {
        const dot = host.querySelector<HTMLDivElement>(".remote-target")
        const target = dot
          ? [parseFloat(dot.style.left) / 100, parseFloat(dot.style.top) / 100]
          : [0.5, 0.5]
        let head = 0
        if (
          collectHeadMotion &&
          host
            .querySelector(".remote-calibration")
            ?.textContent?.includes("Head compensation")
        ) {
          head = Math.sin(clock / 230) * 0.08
        } else if (movedOutsideCheckedPose) {
          head = 0.045
        }
        const pose = {
          kind: "face" as const,
          yaw: head,
          pitch: 0,
          roll: 0,
          x: 0.5 + head,
          y: 0.5,
          scale: 0.2,
        }
        const basePoint: [number, number] | null =
          networkReadings && !missingBasePoint
            ? [
                (target[0]! + gazeError - 0.03 - 0.25 * head) / 1.1,
                (target[1]! + 0.02) / 0.9,
              ]
            : !networkReadings
              ? [target[0]!, target[1]!]
              : null
        let feature = [
          (target[0]! + gazeError - 0.5 - 0.25 * head) / 0.5,
          (target[1]! - 0.5) / 0.5,
          head,
        ]
        if (networkReadings) {
          const geometry = inspectRgbFace(face(), 640, 480)
          if (!geometry.valid) throw new Error(geometry.reason)
          geometry.pose = pose
          geometry.irisOffsets = [
            (target[0]! + gazeError - 0.5 - 0.25 * head) * 0.1,
            (target[1]! - 0.5) * 0.1,
            (target[0]! + gazeError - 0.5 - 0.25 * head) * 0.1,
            (target[1]! - 0.5) * 0.1,
          ]
          feature =
            buildRgbFeatures(
              modeTitle.includes("Mobile") ? "mobile" : "webcam",
              geometry,
              basePoint
            ) ?? []
        }
        return {
          timestamp: clock,
          width: 640,
          height: 480,
          quality: missingEyes ? 0 : 0.9,
          reason: missingEyes ? "face-not-found" : null,
          feature,
          pose,
          eyes: [],
          faceBox: null,
          basePoint,
          cameraOcularOffsets: modeTitle.includes("IR")
            ? [
                0.5 - target[0]!,
                target[1]! - 0.5,
                0.5 - target[0]!,
                target[1]! - 0.5,
              ]
            : undefined,
          baseModelVersion: networkReadings ? "blazegaze-v1" : undefined,
          method: "Simulated processor boundary",
          processingMs: 1,
        }
      }
      class TestWorker {
        onmessage: ((event: MessageEvent) => void) | null = null
        onerror = null
        postMessage(request: RemoteRequest) {
          queueMicrotask(() =>
            this.onmessage?.({
              data:
                request.type === "init"
                  ? { type: "ready", method: "test" }
                  : { type: "result", observation: makeObservation() },
            } as MessageEvent)
          )
        }
        terminate() {
          this.onmessage = null
        }
      }
      globalThis.Worker = TestWorker as unknown as typeof Worker
      const tick = async () =>
        act(async () => {
          clock += 100
          const queued = [...frames]
          frames.clear()
          for (const [, cb] of queued) cb(clock)
          await Promise.resolve()
        })
      await act(async () => root.render(createElement(RemoteEyeTrackingPage)))
      await click(modeTitle as string)
      await click("Start camera")
      await tick()
      expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
        "Calibration"
      )
      expect(host.querySelector(".remote-steps")?.textContent).not.toContain(
        "Position"
      )
      const cameraStep = host.querySelector<HTMLButtonElement>(
        '.remote-steps button[aria-label="2. Camera"]'
      )
      expect(cameraStep).not.toBeNull()
      await act(async () => cameraStep!.click())
      expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
        "Camera"
      )
      await click("Continue to calibration")
      await act(async () => {
        host
          .querySelector<HTMLButtonElement>(
            '.remote-page-heading button[aria-label="Previous step"]'
          )!
          .click()
      })
      expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
        "Camera"
      )
      expect(stopped).toBe(0)
      await click("Back to camera choices")
      expect(host.querySelectorAll(".remote-mode-card")).toHaveLength(3)
      expect(stopped).toBe(1)
      await click(modeTitle as string)
      await click("Start camera")
      await tick()
      expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
        "Calibration"
      )
      const headMovementOption = host.querySelector<HTMLInputElement>(
        'input[aria-label="Include head movement"]'
      )!
      expect(headMovementOption.checked).toBe(true)
      expect(
        host.querySelector('input[aria-label="Adaptive calibration"]')
      ).toBeNull()
      if (!includeHeadMovement)
        await act(async () => headMovementOption.click())
      if (networkReadings) {
        missingBasePoint = true
        await tick()
        const pendingStart = buttons().find(
          (button) => button.getAttribute("aria-label") === "Start calibration"
        )
        expect(pendingStart).toBeDefined()
        expect(pendingStart!.disabled).toBe(true)
        missingBasePoint = false
        await tick()
      }
      await click("Start calibration")
      await click("Start calibration")
      await act(async () => window.dispatchEvent(new Event("resize")))
      expect(host.querySelector(".remote-calibration")).not.toBeNull()
      let validationPromptShown = false
      let canceledValidationPrompt = false
      for (
        let i = 0;
        i < 650 && host.querySelector(".remote-calibration");
        i++
      ) {
        await tick()
        if (
          !validationPromptShown &&
          host.querySelector(
            '.remote-calibration[aria-label="Gaze validation"]'
          )
        ) {
          validationPromptShown = true
          expect(
            host.querySelector(".eye-calibration-welcome h2")?.textContent
          ).toBe("Validation test")
          expect(host.querySelector(".remote-target")).toBeNull()
          for (let frame = 0; frame < 30; frame++) await tick()
          expect(host.querySelector(".remote-target")).toBeNull()
          expect(
            host.querySelector(".eye-calibration-start")?.textContent
          ).toContain("Continue")
          if (cancelValidationPrompt) {
            await click("Cancel capture")
            canceledValidationPrompt = true
            break
          }
          await click("Continue")
          expect(host.querySelector(".remote-target")).not.toBeNull()
        }
      }
      expect(validationPromptShown).toBe(true)
      expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
        "Results"
      )
      if (cancelValidationPrompt) {
        expect(canceledValidationPrompt).toBe(true)
        const kept = await exportResult()
        expect(kept.samples).toHaveLength(162)
        expect(kept.calibration.targetCount).toBe(9)
        expect(kept.validation).toBeNull()
        await click("Validate adjustment")
        await click("Continue")
        for (
          let frame = 0;
          frame < 250 && host.querySelector(".remote-calibration");
          frame++
        )
          await tick()
      }
      await tick()
      await tick()
      const initialResult = await exportResult()
      expect(initialResult.samples).toHaveLength(162)
      expect(initialResult.validationSamples.length).toBeGreaterThan(0)
      expect(initialResult.liveTrace.length).toBeGreaterThan(0)
      const liveReading = initialResult.liveTrace.at(-1)
      expect(liveReading.observation.timestamp).toBeGreaterThan(0)
      expect(liveReading.mappedPoint).toEqual(initialResult.screenPosition)
      expect(liveReading.screenPoint).toEqual(initialResult.screenPosition)
      expect(host.textContent).toContain("Mean target error")
      expect(host.textContent).toContain("5 targets")
      await click("Validate adjustment")
      await click("Continue")
      for (let i = 0; i < 250 && host.querySelector(".remote-calibration"); i++)
        await tick()
      expect(host.textContent).toContain("Mean target error")
      expect(host.textContent).toContain("5 targets")
      // Head-only retries keep the spatial grid and independent accuracy result.
      await click("Learn head correction")
      expect(host.querySelector(".remote-calibration")?.textContent).toContain(
        "Head compensation"
      )
      expect(
        host.querySelector(".remote-calibration")?.textContent
      ).not.toContain("Follow 9 dots")
      await click("Cancel capture")
      expect(host.textContent).toContain("5 targets")
      collectHeadMotion = false
      await click("Learn head correction")
      for (
        let frame = 0;
        frame < 150 && host.querySelector(".remote-calibration");
        frame++
      ) {
        const target = host.querySelector<HTMLElement>(".remote-target")
        if (target) {
          expect(target.style.left).toBe("50%")
          expect(target.style.top).toBe("50%")
        }
        await tick()
      }
      expect(host.querySelector(".remote-calibration")).toBeNull()
      expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
        "Results"
      )
      expect(host.textContent).toContain("Existing calibration kept")
      expect(host.textContent).toContain("5 targets")
      const diagnostic = await exportResult()
      expect(diagnostic.samples).toHaveLength(162)
      expect(diagnostic.validationSamples.length).toBeGreaterThan(0)
      expect(diagnostic.headSamples.length).toBeGreaterThanOrEqual(48)
      expect(
        diagnostic.headSamples.every(
          (sample: CalibrationSample) =>
            sample.target[0] === 0.5 && sample.target[1] === 0.5
        )
      ).toBe(true)
      expect(diagnostic.calibration.targetCount).toBe(9)
      collectHeadMotion = true
      if (includeHeadMovement) {
        expect(diagnostic.calibration.motionFit).toBeDefined()
        await click("Learn head correction")
        for (
          let frame = 0;
          frame < 150 && host.querySelector(".remote-calibration");
          frame++
        ) {
          await tick()
        }
        expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
          "Results"
        )
        // The fixture's first joint fit already compensates its known motion.
        // Repeating that hold must retain its independent accuracy result.
        expect(host.textContent).toContain("Existing calibration kept")
        expect((await exportResult()).calibration).toEqual(
          diagnostic.calibration
        )
      }
      gazeError = 0.15
      await click("Validate adjustment")
      await click("Continue")
      for (let i = 0; i < 450 && host.querySelector(".remote-calibration"); i++)
        await tick()
      expect(host.querySelector(".remote-calibration")).toBeNull()
      expect(host.textContent).toContain("Unverified preview")
      expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
        "Results"
      )
      await click("Validate adjustment")
      await click("Continue")
      missingEyes = true
      for (let i = 0; i < 550 && host.querySelector(".remote-calibration"); i++)
        await tick()
      expect(host.querySelector(".remote-calibration")).toBeNull()
      expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
        "Results"
      )
      expect(host.textContent).toContain("no usable gaze readings")
      missingEyes = false
      gazeError = 0
      await tick()
      await click("Validate adjustment")
      await click("Continue")
      for (let i = 0; i < 450 && host.querySelector(".remote-calibration"); i++)
        await tick()
      expect(host.textContent).toContain("Accuracy checked")
      await click("Show live gaze")
      // Let the displayed estimate settle after the final edge target returns to center.
      for (let frame = 0; frame < 12; frame++) {
        await tick()
      }
      if (includeHeadMovement) {
        movedOutsideCheckedPose = true
        for (let frame = 0; frame < 12; frame++) await tick()
        expect(host.querySelector(".remote-live-dot")).not.toBeNull()
        expect(host.textContent).toContain(
          "Outside your accuracy-checked head range. Gaze remains available."
        )
        expect(host.textContent).not.toContain("Accuracy checked")
        expect(host.textContent).not.toContain("Outside measured head range")
        movedOutsideCheckedPose = false
        // Let the gaze filter settle after returning from the moved pose.
        for (let frame = 0; frame < 40; frame++) await tick()
      }
      if (includeHeadMovement) {
        // Create a real, nonnull affine session alignment through the existing repair UI.
        gazeError = 0.006
        await click("Trial grid repair")
        await click("Continue")
        for (
          let frame = 0;
          frame < 250 && host.querySelector(".remote-calibration");
          frame++
        ) {
          await tick()
        }
        expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
          "Validation"
        )
        gazeError = 0
        await click("Validate gaze")
        await click("Continue")
        for (
          let frame = 0;
          frame < 250 && host.querySelector(".remote-calibration");
          frame++
        ) {
          await tick()
        }
        await click("Show live gaze")
        for (let frame = 0; frame < 20; frame++) await tick()
      }
      const liveBubble = host.querySelector<HTMLElement>(".remote-live-dot")!
      expect(parseFloat(liveBubble.style.width)).toBeGreaterThan(0)
      expect(parseFloat(liveBubble.style.width)).toBeLessThanOrEqual(300)
      expect(liveBubble.style.boxShadow).toBe("none")
      expect(liveBubble.querySelector(".gaze-center-cursor")).not.toBeNull()
      const originalLeft = parseFloat(
        host.querySelector<HTMLElement>(".remote-live-dot")!.style.left
      )
      await click("Correct gaze with a click")
      for (let i = 0; i < 10; i++) {
        await tick()
      }
      const rectangle = spyOn(
        HTMLElement.prototype,
        "getBoundingClientRect"
      ).mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        bottom: window.innerHeight,
        right: window.innerWidth,
        width: window.innerWidth,
        height: window.innerHeight,
        toJSON() {},
      })
      try {
        await act(async () =>
          host
            .querySelector('[aria-label="Click the target to correct gaze"]')!
            .dispatchEvent(
              new PointerEvent("pointerdown", {
                bubbles: true,
                button: 0,
                clientX: (originalLeft / 100) * window.innerWidth + 20,
                clientY: window.innerHeight / 2,
              })
            )
        )
      } finally {
        rectangle.mockRestore()
      }
      const adjustedLeft = parseFloat(
        host.querySelector<HTMLElement>(".remote-live-dot")!.style.left
      )
      expect(adjustedLeft - originalLeft).toBeCloseTo(
        (20 / window.innerWidth) * 100
      )
      expect(host.textContent).toContain("Previous accuracy check")
      if (includeHeadMovement) {
        const before = await exportResult()
        expect(before.gazeOffset[0]).not.toBe(0)
        expect(before.sessionAlignment).not.toBeNull()
        await click("Learn head correction")
        await click("Cancel capture")
        const cancelled = await exportResult()
        expect(cancelled.gazeOffset).toEqual(before.gazeOffset)
        expect(cancelled.sessionAlignment).toEqual(before.sessionAlignment)
        expect(cancelled.validation).toEqual(before.validation)
        collectHeadMotion = false
        await click("Learn head correction")
        for (
          let frame = 0;
          frame < 150 && host.querySelector(".remote-calibration");
          frame++
        )
          await tick()
        const rejected = await exportResult()
        expect(rejected.gazeOffset).toEqual(before.gazeOffset)
        expect(rejected.sessionAlignment).toEqual(before.sessionAlignment)
        expect(rejected.validation).toEqual(before.validation)
        expect(host.querySelector(".remote-live-dot")).not.toBeNull()
        collectHeadMotion = true
        await click("Learn head correction")
        for (
          let frame = 0;
          frame < 150 && host.querySelector(".remote-calibration");
          frame++
        )
          await tick()
        expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
          "Results"
        )
        const updated = await exportResult()
        expect(updated.gazeOffset).toEqual(before.gazeOffset)
        expect(updated.sessionAlignment).toEqual(before.sessionAlignment)
        expect(updated.calibration.coefficients).toEqual(
          before.calibration.coefficients
        )
        expect(updated.validation).toEqual(before.validation)
        expect(updated.calibration.motionFit).toBeDefined()
        expect(updated.headCorrectionComparison.active).toBe(true)
        expect(updated.headCorrectionComparison.kind).toBe("joint-motion")
        expect(updated.headCorrectionComparison.before).toBeNull()
        for (let frame = 0; frame < 20; frame++) await tick()
        expect(
          host.querySelector<HTMLElement>(".remote-live-dot")!.style.width
        ).not.toBe("10px")
        expect(
          parseFloat(
            host.querySelector<HTMLElement>(".remote-live-dot")!.style.left
          )
        ).toBeCloseTo(adjustedLeft)
      }
      await click("Reset gaze offset")
      expect(
        parseFloat(
          host.querySelector<HTMLElement>(".remote-live-dot")!.style.left
        )
      ).toBeCloseTo(originalLeft)
      expect(host.textContent).not.toContain("Previous accuracy check")
      if (reloadProfile) {
        const current = await exportResult()
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(cameraId)
        )
        const cameraIdentity = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0")
        ).join("")
        saveCalibrationProfile({
          id: "personal-webcam",
          name: "Personal webcam",
          updatedAt: new Date().toISOString(),
          payload: { kind: "remote", model: current.calibration },
          offset: current.gazeOffset,
          alignment: current.sessionAlignment,
          context: {
            version: 1,
            tracker: "webcam",
            featureVersion: current.calibration.featureVersion,
            cameraIdentity,
            width: 640,
            height: 480,
            inputTransform: "camera-raw",
            outputSpace: "screen",
            screenAspect: window.innerWidth / window.innerHeight,
            setupKey: JSON.stringify({
              roi: { x: 0, y: 0, width: 1, height: 1 },
              irRollCompensation: false,
              viewport: [window.innerWidth, window.innerHeight],
            }),
            geometryId: null,
          },
        })
        await act(async () => root.render(null))
        await act(async () => root.render(createElement(RemoteEyeTrackingPage)))
        await click(modeTitle as string)
        await click("Start camera")
        for (
          let frame = 0;
          frame < 40 &&
          host.querySelector(".remote-controls h2")?.textContent !== "Results";
          frame++
        )
          await tick()
        expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
          "Results"
        )
        expect(host.querySelector(".remote-calibration")).toBeNull()
        expect(host.textContent).toContain("Loaded · saved calibration")
        expect(host.textContent).not.toContain("Accuracy checked")
        expect(host.querySelector(".remote-live-dot")).not.toBeNull()
      }
      await act(async () => ended?.())
      expect(host.textContent).toContain("Camera disconnected")
      expect(
        buttons().some((button) => button.textContent === "Start camera")
      ).toBe(true)
      expect(host.querySelector(".remote-live-dot")).toBeNull()
      expect(host.textContent).not.toContain("Mean target error")
      await click("Start camera")
      await tick()
      expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
        "Results"
      )
      await click("4. Check accuracy")
      expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
        "Validation"
      )
      expect(host.textContent).toContain("162 synchronized samples")
      await click("Quick check")
      await click("Continue")
      const heightDescriptor = Object.getOwnPropertyDescriptor(
        window,
        "innerHeight"
      )
      const height = window.innerHeight
      try {
        Object.defineProperty(window, "innerHeight", {
          configurable: true,
          value: height - 50,
        })
        await act(async () => window.dispatchEvent(new Event("resize")))
        await tick()
        expect(host.querySelector(".remote-calibration")).not.toBeNull()
        expect(host.textContent).toContain("Window size changed")
        Object.defineProperty(window, "innerHeight", {
          configurable: true,
          value: height,
        })
        await act(async () => window.dispatchEvent(new Event("resize")))
      } finally {
        if (heightDescriptor)
          Object.defineProperty(window, "innerHeight", heightDescriptor)
        else Reflect.deleteProperty(window, "innerHeight")
      }
      for (
        let frame = 0;
        frame < 150 && host.querySelector(".remote-calibration");
        frame++
      ) {
        await tick()
      }
      expect(host.textContent).toContain("3 targets")
      expect(host.textContent).toContain("Mean target error")
      await act(async () => window.dispatchEvent(new Event("resize")))
      expect(host.textContent).toContain("Mean target error")
      const widthDescriptor = Object.getOwnPropertyDescriptor(
        window,
        "innerWidth"
      )
      const width = window.innerWidth
      try {
        await click("Validate adjustment")
        await click("Continue")
        Object.defineProperty(window, "innerWidth", {
          configurable: true,
          value: width - 100,
        })
        await act(async () => window.dispatchEvent(new Event("resize")))
        expect(host.textContent).toContain("Window size changed")
        await click("Cancel capture")
        expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
          "Calibration"
        )
      } finally {
        if (widthDescriptor)
          Object.defineProperty(window, "innerWidth", widthDescriptor)
        else Reflect.deleteProperty(window, "innerWidth")
      }
      expect(host.querySelector(".remote-controls h2")?.textContent).toBe(
        "Calibration"
      )
      expect(host.textContent).not.toContain("Mean target error")
      expect(
        buttons().some(
          (button) => button.getAttribute("aria-label") === "Start calibration"
        )
      ).toBe(true)
      await act(async () => ended?.())
      expect(host.textContent).toContain("Camera disconnected")
      expect(buttons().some((b) => b.textContent === "Start camera")).toBe(true)
      expect(stopped).toBe(3 + Number(reloadProfile))
    } finally {
      await act(async () => root.unmount())
      host.remove()
      performance.now = originalNow
      globalThis.requestAnimationFrame = originalRequest
      globalThis.cancelAnimationFrame = originalCancel
      globalThis.Worker = originalWorker
      globalThis.createImageBitmap = originalCapture
      HTMLVideoElement.prototype.play = originalPlay
      HTMLVideoElement.prototype.pause = originalPause
      for (const [object, key, descriptor] of [
        [navigator, "mediaDevices", mediaDescriptor],
        [globalThis, "isSecureContext", secureDescriptor],
        [HTMLVideoElement.prototype, "srcObject", sourceDescriptor],
        [HTMLVideoElement.prototype, "currentTime", timeDescriptor],
        [HTMLVideoElement.prototype, "videoWidth", widthDescriptor],
        [HTMLVideoElement.prototype, "readyState", readyDescriptor],
      ] as const) {
        if (descriptor) Object.defineProperty(object, key, descriptor)
        else Reflect.deleteProperty(object, key)
      }
    }
  },
  15000
)
