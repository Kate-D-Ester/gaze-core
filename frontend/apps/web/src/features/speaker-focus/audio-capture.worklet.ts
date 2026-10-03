import type { CaptureControl } from "./audio-capture.worklet.types"
import { PcmResampler } from "./resampler"
class SpeakerPcm extends AudioWorkletProcessor {
  private resampler = new PcmResampler(sampleRate)
  private chunk = new Float32Array(1600)
  private filled = 0
  private timestamp: number | null = null
  private generation = 0
  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent<CaptureControl>) => {
      this.generation = event.data.generation
      this.filled = 0
      this.timestamp = null
      this.resampler = new PcmResampler(sampleRate)
    }
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    outputs.forEach((output) => output.forEach((channel) => channel.fill(0)))
    const input = inputs[0]?.[0]
    if (!input) {
      return true
    }
    this.timestamp ??= currentFrame / sampleRate
    const pcm = this.resampler.push(input)
    for (const value of pcm) {
      this.chunk[this.filled++] = value
      if (this.filled === 1600) {
        const buffer = this.chunk.buffer
        this.port.postMessage(
          {
            pcm: buffer,
            timestamp: this.timestamp,
            generation: this.generation,
          },
          [buffer]
        )
        this.timestamp += 0.1
        this.chunk = new Float32Array(1600)
        this.filled = 0
      }
    }
    return true
  }
}
registerProcessor("speaker-pcm", SpeakerPcm)
