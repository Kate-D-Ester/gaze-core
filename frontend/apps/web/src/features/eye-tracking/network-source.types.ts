export type NetworkSource =
  | {
      kind: "mjpeg"
      name: string
      firstFrame: Uint8Array
      frames: AsyncGenerator<Uint8Array>
    }
  | {
      kind: "video"
      name: string
      video: HTMLVideoElement
    }
