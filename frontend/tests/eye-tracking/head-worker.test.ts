import {
  afterAll,
  beforeAll,
  beforeEach,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test"
import type {
  HeadWorkerRequest,
  HeadWorkerResponse,
} from "../../apps/web/src/features/eye-tracking/head-tracking/head.worker.types"

const responses: HeadWorkerResponse[] = []
const inferenceTimestamps: number[] = []
let lastPacketTimestamp = -1
let hasFace = true
const workerScope = {
  onmessage: async (_event: MessageEvent<HeadWorkerRequest>) => {},
  postMessage(message: HeadWorkerResponse) {
    responses.push(message)
  },
}
const originalSelf = Object.getOwnPropertyDescriptor(globalThis, "self")
const originalCanvas = Object.getOwnPropertyDescriptor(
  globalThis,
  "OffscreenCanvas"
)

mock.module("@mediapipe/tasks-vision", () => ({
  FilesetResolver: {
    forVisionTasks: async () => ({ wasmLoaderPath: "test-loader" }),
  },
  FaceLandmarker: {
    createFromOptions: async () => {
      lastPacketTimestamp = -1
      return {
        detectForVideo(_image: OffscreenCanvas, timestamp: number) {
          // Match the graph's integer-microsecond timestamp ordering requirement.
          const packetTimestamp = Math.trunc(timestamp * 1000)
          if (packetTimestamp <= lastPacketTimestamp) {
            throw new Error("Packet timestamp mismatch on stream norm_rect")
          }
          lastPacketTimestamp = packetTimestamp
          inferenceTimestamps.push(timestamp)
          if (!hasFace) {
            return { faceLandmarks: [], facialTransformationMatrixes: [] }
          }
          return {
            faceLandmarks: [
              [
                { x: 0.5, y: 0.5 },
                { x: 0.5, y: 0.4 },
              ],
            ],
            facialTransformationMatrixes: [
              {
                data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, -3, -50, 1],
              },
            ],
          }
        },
      }
    },
  },
}))

async function send(message: HeadWorkerRequest): Promise<void> {
  await workerScope.onmessage({
    data: message,
  } as MessageEvent<HeadWorkerRequest>)
}

async function sendFrame(timestamp: number, id: number): Promise<void> {
  const close = mock(() => {})
  await send({
    type: "frame",
    timestamp,
    id,
    transform: { rotation: 0, mirrorX: false, mirrorY: false },
    image: { width: 320, height: 240, close } as unknown as ImageBitmap,
  })
  expect(close).toHaveBeenCalledTimes(1)
}

beforeAll(async () => {
  Object.defineProperty(globalThis, "self", {
    configurable: true,
    value: workerScope,
  })
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    configurable: true,
    value: class {
      constructor(
        public width: number,
        public height: number
      ) {}
      getContext() {
        return { setTransform() {}, drawImage() {} }
      }
    },
  })
  spyOn(globalThis, "fetch").mockImplementation(async () => new Response(""))
  spyOn(URL, "createObjectURL").mockReturnValue(
    "data:text/javascript,export default null"
  )
  spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  await import("../../apps/web/src/features/eye-tracking/head-tracking/head.worker")
})

beforeEach(async () => {
  responses.length = 0
  inferenceTimestamps.length = 0
  hasFace = true
  await send({ type: "initialize" })
  expect(responses).toEqual([{ type: "ready" }])
})

afterAll(() => {
  mock.restore()
  if (originalSelf) Object.defineProperty(globalThis, "self", originalSelf)
  else Reflect.deleteProperty(globalThis, "self")
  if (originalCanvas)
    Object.defineProperty(globalThis, "OffscreenCanvas", originalCanvas)
  else Reflect.deleteProperty(globalThis, "OffscreenCanvas")
})

test("repeated camera capture times cannot crash the head-tracking graph", async () => {
  await sendFrame(1873537.6, 1)
  await sendFrame(1873537.6, 2)
  expect(responses.map((message) => message.type)).toEqual([
    "ready",
    "pose",
    "pose",
  ])
  expect(inferenceTimestamps[1]).toBeGreaterThan(inferenceTimestamps[0])
  const response = responses.at(-1)
  if (response?.type !== "pose") throw new Error("Expected a head pose")
  expect(response.pose?.timestamp).toBe(1873537.6)
})

test("switching from fallback read time to older capture metadata stays connected", async () => {
  for (const [id, timestamp] of [2000, 1900, 1933, 2100].entries()) {
    await sendFrame(timestamp, id)
  }
  expect(responses.map((message) => message.type)).toEqual([
    "ready",
    "pose",
    "pose",
    "pose",
    "pose",
  ])
  for (let index = 1; index < inferenceTimestamps.length; index++) {
    expect(inferenceTimestamps[index]).toBeGreaterThan(
      inferenceTimestamps[index - 1]
    )
  }
  expect(responses[2]).toMatchObject({
    type: "pose",
    pose: { timestamp: 1900 },
  })
})

test("sub-microsecond capture changes remain distinct after graph timestamp conversion", async () => {
  await sendFrame(1000, 1)
  await sendFrame(1000.0001, 2)
  expect(responses.map((message) => message.type)).toEqual([
    "ready",
    "pose",
    "pose",
  ])
})

test("frames without a detected face also advance the graph clock", async () => {
  hasFace = false
  await sendFrame(1000, 1)
  hasFace = true
  await sendFrame(1000, 2)
  expect(responses[1]).toEqual({ type: "pose", pose: null })
  expect(responses[2]).toMatchObject({
    type: "pose",
    pose: { id: 2, timestamp: 1000 },
  })
})

test("a new inference session starts a fresh graph clock", async () => {
  await sendFrame(5000, 1)
  await send({ type: "initialize" })
  await sendFrame(1000, 2)
  expect(inferenceTimestamps[1]).toBeLessThan(inferenceTimestamps[0])
  expect(responses.at(-1)).toMatchObject({
    type: "pose",
    pose: { timestamp: 1000 },
  })
})

test("invalid capture times cannot poison the inference clock", async () => {
  for (const [id, timestamp] of [NaN, Infinity, -1].entries()) {
    await sendFrame(timestamp, id)
    expect(responses.at(-1)).toEqual({ type: "pose", pose: null })
  }
  expect(inferenceTimestamps).toHaveLength(0)
  await sendFrame(1000, 4)
  expect(responses.at(-1)).toMatchObject({
    type: "pose",
    pose: { timestamp: 1000 },
  })
})
