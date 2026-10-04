import type { EncodedFrame, PreviewBufferOptions } from "./preview-buffer.types"
export class PreviewBuffer {
  bytes = 0
  private frames: EncodedFrame[] = []
  private generation = 0
  private epoch = 0
  private bitmap: ImageBitmap | null = null
  private decoded: EncodedFrame | null = null
  private decoding = false
  private readonly decode: (jpeg: Blob) => Promise<ImageBitmap>
  constructor(private readonly options: PreviewBufferOptions = {}) {
    this.decode = options.decode ?? ((jpeg) => createImageBitmap(jpeg))
  }
  reset(generation = 0): void {
    this.epoch++
    this.generation = generation
    this.frames = []
    this.bytes = 0
    this.bitmap?.close()
    this.bitmap = null
    this.decoded = null
  }
  add(sample: number, jpeg: Blob, generation: number): void {
    if (generation !== this.generation) {
      return
    }
    if (
      !Number.isSafeInteger(sample) ||
      sample < 0 ||
      (this.frames.length &&
        sample <= this.frames[this.frames.length - 1]!.sample)
    ) {
      throw new Error("Preview source is discontinuous")
    }
    if (this.bytes + jpeg.size > (this.options.maxBytes ?? 64 * 1024 * 1024)) {
      throw new Error("Preview buffer is full; resume listening")
    }
    this.frames.push({ sample, jpeg })
    this.bytes += jpeg.size
  }
  async drawAt(
    canvas: HTMLCanvasElement,
    sample: number,
    generation: number
  ): Promise<number | null> {
    if (generation !== this.generation || this.decoding) {
      return null
    }
    while (this.frames.length > 1 && this.frames[1]!.sample <= sample) {
      const removed = this.frames.shift()!
      this.bytes -= removed.jpeg.size
    }
    const chosen = this.frames[0]
    if (!chosen || chosen.sample > sample) {
      return null
    }
    if (chosen !== this.decoded) {
      const epoch = this.epoch
      this.decoding = true
      try {
        const bitmap = await this.decode(chosen.jpeg)
        if (epoch !== this.epoch) {
          bitmap.close()
          return null
        }
        this.bitmap?.close()
        this.bitmap = bitmap
        this.decoded = chosen
      } finally {
        this.decoding = false
      }
    }
    if (this.bitmap) {
      canvas.width = this.bitmap.width
      canvas.height = this.bitmap.height
      const context = canvas.getContext("2d")
      if (context) {
        context.drawImage(this.bitmap, 0, 0)
        return chosen.sample
      }
    }
    return null
  }
  dispose(): void {
    this.reset(this.generation + 1)
  }
}
