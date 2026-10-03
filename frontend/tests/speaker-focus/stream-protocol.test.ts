import { expect, test } from "bun:test"

async function protocol() {
  try {
    return await import("../../apps/web/src/features/speaker-focus/stream-protocol")
  } catch {
    throw new Error("Versioned source-sample streaming is not implemented")
  }
}

test("sample position is independent of the packet capture clock", async () => {
  const { packetBytes } = await protocol()
  const packet = packetBytes(1, 3, 1600, 10, new Float32Array(1600).buffer)
  const view = new DataView(packet)
  expect(new TextDecoder().decode(new Uint8Array(packet, 0, 4))).toBe("GSP2")
  expect(packet.byteLength).toBe(6432)
  expect(view.getUint32(8, true)).toBe(3)
  expect(view.getBigUint64(12, true)).toBe(1600n)
  expect(view.getFloat64(20, true)).toBe(10)
  expect(view.getUint32(28, true)).toBe(6400)
})

test("unsafe indices and nonfinite capture clocks cannot become packets", async () => {
  const { packetBytes } = await protocol()
  const pcm = new Float32Array(1600).buffer
  expect(() => packetBytes(1, 0, 2 ** 53, 1, pcm)).toThrow()
  expect(() => packetBytes(1, 0, 0, Number.NaN, pcm)).toThrow()
  expect(() => packetBytes(1, -1, 0, 1, pcm)).toThrow()
})
