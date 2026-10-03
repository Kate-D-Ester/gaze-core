/** Versioned packets carry sample-exact source positions and a separate clock. */
export function packetBytes(
  kind: 1 | 2,
  generation: number,
  sampleStart: number,
  captureTime: number,
  payload: ArrayBuffer
): ArrayBuffer {
  if (
    (kind !== 1 && kind !== 2) ||
    !Number.isInteger(generation) ||
    generation < 0 ||
    generation > 0xffffffff ||
    !Number.isSafeInteger(sampleStart) ||
    sampleStart < 0 ||
    !Number.isFinite(captureTime) ||
    captureTime < 0 ||
    payload.byteLength === 0 ||
    payload.byteLength > 200000 ||
    (kind === 1 && (payload.byteLength % 4 !== 0 || payload.byteLength > 12800))
  ) {
    throw new Error("Invalid source-sample streaming packet")
  }
  const bytes = new Uint8Array(32 + payload.byteLength)
  bytes.set([71, 83, 80, 50])
  const view = new DataView(bytes.buffer)
  view.setUint8(4, kind)
  view.setUint32(8, generation, true)
  view.setBigUint64(12, BigInt(sampleStart), true)
  view.setFloat64(20, captureTime, true)
  view.setUint32(28, payload.byteLength, true)
  bytes.set(new Uint8Array(payload), 32)
  return bytes.buffer
}
