import { validateNativeGazeInput } from "./native-gaze-input"
import type {
  NativeGazeInput,
  NativeGazeModel,
  NativeGazeResult,
} from "./native-gaze-model.types"
import type { Vector3 } from "../../../apps/web/src/features/eye-tracking/eye-tracking.types"

const ASSETS = "/models/gaze-3d-prototype"
const MODEL_SHA256 =
  "3ba669723b5e1c7cd1b75e579059f2143b82f0d1bc6c2e6f595f3d171fa1cfdc"
const OUTPUT_NAME = "gaze_vector/sink_port_0"

/** Experimental raw-vector runner. Its result intentionally cannot be passed to the camera-ray projector. */
export async function loadNativeGazeModel(): Promise<NativeGazeModel> {
  const response = await fetch(`${ASSETS}/model.onnx`, {
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    throw new Error(
      "The experimental 3D gaze model is unavailable. Prepare its local assets first."
    )
  }
  const bytes = await response.arrayBuffer()
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  const checksum = Array.from(digest, (value) =>
    value.toString(16).padStart(2, "0")
  ).join("")
  if (checksum !== MODEL_SHA256) {
    throw new Error("The experimental 3D gaze model failed its integrity check")
  }
  const ort = await import("onnxruntime-web/wasm")
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  ort.env.wasm.wasmPaths = `${ASSETS}/runtime/`
  const session = await ort.InferenceSession.create(bytes, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  })
  const expectedInputs = [
    "left_eye_image",
    "right_eye_image",
    "head_pose_angles",
  ]
  if (
    session.inputNames.length !== 3 ||
    !expectedInputs.every((name) => session.inputNames.includes(name)) ||
    session.outputNames.length !== 1 ||
    session.outputNames[0] !== OUTPUT_NAME
  ) {
    await session.release()
    throw new Error(
      "The experimental 3D gaze model has an incompatible input/output contract"
    )
  }
  let disposed = false
  let pending: Promise<NativeGazeResult> | null = null
  let closing: Promise<void> | null = null

  async function infer(input: NativeGazeInput): Promise<NativeGazeResult> {
    const left = new ort.Tensor("float32", input.leftEye, [1, 3, 60, 60])
    const right = new ort.Tensor("float32", input.rightEye, [1, 3, 60, 60])
    const head = new ort.Tensor(
      "float32",
      new Float32Array(input.headAnglesDegrees),
      [1, 3]
    )
    const started = performance.now()
    const outputs = await session
      .run({
        left_eye_image: left,
        right_eye_image: right,
        head_pose_angles: head,
      })
      .finally(() => {
        left.dispose()
        right.dispose()
        head.dispose()
      })
    try {
      const output = outputs[OUTPUT_NAME]
      if (
        !(output.data instanceof Float32Array) ||
        output.dims.join(",") !== "1,3" ||
        output.data.length !== 3 ||
        !output.data.every(Number.isFinite) ||
        Math.hypot(...output.data) < 1e-8
      ) {
        throw new Error(
          "The experimental 3D gaze model produced an invalid vector"
        )
      }
      return {
        frame: "model-native-unverified",
        vector: Array.from(output.data) as Vector3,
        modelId: "intel-gaze-adas-0002-onnx-prototype",
        inferenceMs: performance.now() - started,
      }
    } finally {
      for (const output of Object.values(outputs)) {
        output.dispose()
      }
    }
  }

  return {
    async predict(input) {
      if (disposed) {
        throw new Error("The experimental 3D gaze model is disposed")
      }
      if (pending) {
        throw new Error(
          "The experimental 3D gaze model is already processing a frame"
        )
      }
      if (!validateNativeGazeInput(input)) {
        throw new Error(
          "Invalid raw eye pixels or head angles for the experimental 3D gaze model"
        )
      }
      pending = infer(input)
      try {
        return await pending
      } finally {
        pending = null
      }
    },
    async dispose() {
      disposed = true
      closing ??= (async () => {
        await pending?.catch(() => undefined)
        await session.release()
      })()
      await closing
    },
  }
}
