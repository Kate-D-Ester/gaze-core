export type CaptureControl = { generation: number }
declare global {
  const sampleRate: number
  const currentFrame: number
  abstract class AudioWorkletProcessor {
    readonly port: MessagePort
    abstract process(
      inputs: Float32Array[][],
      outputs: Float32Array[][]
    ): boolean
  }
  function registerProcessor(
    name: string,
    processor: typeof AudioWorkletProcessor
  ): void
}
