import { expect, test } from "bun:test"
import { PreviewBuffer } from "../../apps/web/src/features/speaker-focus/preview-buffer"
test("encoded preview keeps the source cursor frame and frees consumed data", async () => {
  const closed: number[] = []
  const drawn: number[] = []
  let id = 0
  const buffer = new PreviewBuffer({
    maxBytes: 10,
    decode: async () => {
      const key = ++id
      return {
        width: 8,
        height: 8,
        close: () => closed.push(key),
        key,
      } as unknown as ImageBitmap
    },
  })
  buffer.reset(1)
  buffer.add(0, new Blob(["1234"]), 1)
  buffer.add(16000, new Blob(["1234"]), 1)
  const canvas = {
    getContext: () => ({
      drawImage: (image: { key: number }) => drawn.push(image.key),
    }),
  } as unknown as HTMLCanvasElement
  await buffer.drawAt(canvas, 15999, 1)
  expect(drawn).toEqual([1])
  await buffer.drawAt(canvas, 16000, 1)
  expect(closed).toEqual([1])
  expect(buffer.bytes).toBe(4)
  expect(() => buffer.add(32000, new Blob(["1234567"]), 1)).toThrow()
  buffer.reset(2)
  expect(buffer.bytes).toBe(0)
  expect(closed).toEqual([1, 2])
})
