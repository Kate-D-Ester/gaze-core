import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerOptions,
} from "../../apps/web/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs"
import { createLandmarker } from "../../apps/web/src/features/remote-eye-tracking/face-landmarker"

const savedGlobals = new Map<string, PropertyDescriptor | undefined>()
let consumedOptions: FaceLandmarkerOptions[] = []
const spies: { mockRestore(): void }[] = []

// Bun cannot initialize a worker GPU. Replace that external boundary while
// exercising the real loader's defaults, option forwarding, and CPU retry.
beforeEach(() => {
  for (const name of ["OffscreenCanvas", "location", "ModuleFactory", "Module"])
    savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    configurable: true,
    value: class {
      constructor(
        public width: number,
        public height: number
      ) {}
    },
  })
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { origin: "https://localhost" },
  })
  consumedOptions = []
  spies.push(
    spyOn(FilesetResolver, "forVisionTasks").mockResolvedValue({
      wasmLoaderPath:
        "data:text/javascript,export default function factory() {}",
      wasmBinaryPath: "/vision.wasm",
    }),
    spyOn(FaceLandmarker, "createFromOptions").mockImplementation(
      async (_fileset, options) => {
        consumedOptions.push(options)
        return {} as FaceLandmarker
      }
    )
  )
})
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore()
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
  savedGlobals.clear()
})

test("RGB defaults retain blink inference and live head-pose matrices", async () => {
  await createLandmarker()
  expect(consumedOptions[0].outputFaceBlendshapes).toBe(true)
  expect(consumedOptions[0].outputFacialTransformationMatrixes).toBe(true)
  expect(consumedOptions[0].numFaces).toBe(2)
})

test("IR can omit unused blendshape inference while retaining live head pose", async () => {
  await createLandmarker({ outputFaceBlendshapes: false })
  expect(consumedOptions[0].outputFaceBlendshapes).toBe(false)
  expect(consumedOptions[0].outputFacialTransformationMatrixes).toBe(true)
  expect(consumedOptions[0].numFaces).toBe(2)
})

test("CPU fallback preserves the requested IR inference configuration", async () => {
  spies[1].mockRestore()
  spies[1] = spyOn(FaceLandmarker, "createFromOptions").mockImplementation(
    async (_fileset, options) => {
      consumedOptions.push(options)
      if (options.baseOptions?.delegate === "GPU")
        throw new Error("GPU unavailable")
      return {} as FaceLandmarker
    }
  )
  const result = await createLandmarker({ outputFaceBlendshapes: false })
  expect(result.delegate).toBe("CPU")
  expect(
    consumedOptions.map((options) => options.outputFaceBlendshapes)
  ).toEqual([false, false])
  expect(
    consumedOptions.every(
      (options) => options.outputFacialTransformationMatrixes
    )
  ).toBe(true)
})
