export type StreamPacketHeader = {
  kind: 1 | 2
  generation: number
  sampleStart: number
  captureTime: number
}
