import { hasFreshFrame } from "./selection"
import type { PhotoCamera } from "./photo.types"

export async function captureCameraPhoto(
  camera: PhotoCamera,
  now = performance.now()
): Promise<Blob> {
  const state = camera.getSnapshot()
  if (!hasFreshFrame(state, now)) {
    throw new Error(
      "Connect a camera and wait for a fresh frame before taking a photo."
    )
  }
  const image = document.createElement("canvas")
  image.width = state.frame!.width
  image.height = state.frame!.height
  const context = image.getContext("2d")
  if (!context) {
    throw new Error("This browser could not prepare the photo.")
  }
  try {
    context.drawImage(camera.rawCanvas, 0, 0, image.width, image.height)
    return await new Promise<Blob>((resolve, reject) => {
      image.toBlob((blob) => {
        if (blob?.size) {
          resolve(blob)
        } else {
          reject(
            new Error("The browser could not encode the photo. Try again.")
          )
        }
      }, "image/png")
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "SecurityError") {
      throw new Error(
        "This stream does not allow image capture. Enable CORS on the camera stream."
      )
    }
    throw error
  }
}
