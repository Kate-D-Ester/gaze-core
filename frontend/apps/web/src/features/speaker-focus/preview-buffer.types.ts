export type EncodedFrame = { sample: number; jpeg: Blob }
export type PreviewBufferOptions = {
  maxBytes?: number
  decode?: (jpeg: Blob) => Promise<ImageBitmap>
}
