import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision-remote"
import type {
  FaceLandmarkerOptions,
  FaceLandmarkerRuntime,
  ImportedVisionModule,
  VisionModuleFactory,
} from "./face-landmarker.types"
const ASSETS = "/models/remote-eye-tracking"
export async function createLandmarker({
  outputFaceBlendshapes = true,
}: FaceLandmarkerOptions = {}): Promise<FaceLandmarkerRuntime> {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error(
      "Local face tracking requires a browser with OffscreenCanvas support"
    )
  }
  const fileset = await FilesetResolver.forVisionTasks(
    `${ASSETS}/mediapipe`,
    true
  )
  // The ES-module loader is cached by import(). MediaPipe clears ModuleFactory after each
  // creation, so restore the exported factory for each delegate attempt/reinitialization.
  const loaderUrl = new URL(fileset.wasmLoaderPath, globalThis.location.origin)
    .href
  const loader = (await import(
    /* webpackIgnore: true */ loaderUrl
  )) as ImportedVisionModule
  const scope = globalThis as typeof globalThis & VisionModuleFactory
  for (const delegate of ["GPU", "CPU"] as const) {
    const canvas = new OffscreenCanvas(1, 1)
    try {
      scope.ModuleFactory = loader.default
      const landmarker = await FaceLandmarker.createFromOptions(
        { ...fileset, wasmLoaderPath: "" },
        {
          baseOptions: {
            modelAssetPath: `${ASSETS}/face_landmarker.task`,
            delegate,
          },
          canvas,
          runningMode: "VIDEO",
          // MediaPipe enables temporal smoothing only for a single tracked face.
          // This configuration cannot establish whether another person is present.
          numFaces: 1,
          minFaceDetectionConfidence: 0.6,
          minFacePresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
          outputFaceBlendshapes,
          outputFacialTransformationMatrixes: true,
        }
      )
      return { landmarker, canvas, delegate }
    } catch (error) {
      canvas.width = canvas.height = 0
      if (delegate === "CPU") {
        throw new Error(
          `Unable to initialize local face/iris inference: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    } finally {
      delete scope.ModuleFactory
      delete scope.Module
    }
  }
  throw new Error("No local face inference delegate is available")
}
