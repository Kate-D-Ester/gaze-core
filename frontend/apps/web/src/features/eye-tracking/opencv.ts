import type * as OpenCv from "@techstark/opencv-js"
import cvModule from "@techstark/opencv-js"
export type CV = typeof OpenCv
let pending: Promise<{ cv: CV }> | null = null
/** Lazy-loaded once in the worker; no remote script/CDN and no camera-frame upload. */
export function loadOpenCv(): Promise<{ cv: CV }> {
  pending ??= (async () => {
    const imported = cvModule as unknown as CV | Promise<CV>
    const cv = imported instanceof Promise ? await imported : imported
    if (!cv.Mat)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              new Error(
                "The vision engine did not initialize. Reload to retry."
              )
            ),
          30000
        )
        cv.onRuntimeInitialized = () => {
          clearTimeout(timeout)
          resolve()
        }
      })
    return { cv }
  })().catch((error) => {
    pending = null
    throw error
  })
  return pending
}
