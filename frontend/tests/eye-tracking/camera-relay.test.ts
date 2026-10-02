import { expect, test } from "bun:test"
import { createCameraRelayHandler } from "../../apps/web/src/features/eye-tracking/camera-relay-server"

const appOrigin = "http://127.0.0.1:4014"

function relayRequest(target: string, headers: HeadersInit = {}) {
  const url = new URL("http://127.0.0.1:4022/stream")
  url.searchParams.set("url", target)
  const requestHeaders = new Map(
    Object.entries(headers as Record<string, string>).map(([name, value]) => [
      name.toLowerCase(),
      value,
    ])
  )
  if (!requestHeaders.has("origin")) requestHeaders.set("origin", appOrigin)
  return {
    url: url.href,
    method: "GET",
    headers: {
      get: (name: string) => requestHeaders.get(name.toLowerCase()) ?? null,
    },
    signal: new AbortController().signal,
  } as Request
}

test("relays .local MJPEG streams and adds browser CORS headers", async () => {
  let requestedUrl = ""
  const handler = createCameraRelayHandler({
    allowedOrigins: [appOrigin],
    fetcher: async (input) => {
      requestedUrl = String(input)
      return new Response("frame", {
        headers: {
          "Content-Type": "multipart/x-mixed-replace; boundary=frame",
        },
      })
    },
  })

  const response = await handler(relayRequest("http://esp32.local/stream"))

  expect(requestedUrl).toBe("http://esp32.local/stream")
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(appOrigin)
  expect(response.headers.get("Content-Type")).toContain(
    "multipart/x-mixed-replace"
  )
  expect(await response.text()).toBe("frame")
})

test("relays private IP cameras and forwards video range requests", async () => {
  let requestedUrl = ""
  let forwardedRange = ""
  const handler = createCameraRelayHandler({
    allowedOrigins: [appOrigin],
    fetcher: async (input, init) => {
      requestedUrl = String(input)
      forwardedRange = new Headers(init?.headers).get("Range") ?? ""
      return new Response("video", {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Range": "bytes 0-4/10",
        },
      })
    },
  })

  const response = await handler(
    relayRequest("http://192.168.1.40:81/stream", { Range: "bytes=0-4" })
  )

  expect(requestedUrl).toBe("http://192.168.1.40:81/stream")
  expect(forwardedRange).toBe("bytes=0-4")
  expect(response.status).toBe(206)
  expect(response.headers.get("Content-Range")).toBe("bytes 0-4/10")
})

test("rejects public camera targets before making a request", async () => {
  let fetched = false
  const handler = createCameraRelayHandler({
    allowedOrigins: [appOrigin],
    fetcher: async () => {
      fetched = true
      return new Response()
    },
  })

  const response = await handler(relayRequest("https://example.com/stream"))

  expect(response.status).toBe(400)
  expect(fetched).toBe(false)
})

test("does not follow camera redirects", async () => {
  let redirectMode = ""
  const handler = createCameraRelayHandler({
    allowedOrigins: [appOrigin],
    fetcher: async (_input, init) => {
      redirectMode = String(init?.redirect)
      return new Response(null, {
        status: 302,
        headers: { Location: "http://192.168.1.20/private" },
      })
    },
  })

  const response = await handler(relayRequest("http://192.168.1.40/stream"))

  expect(redirectMode).toBe("manual")
  expect(response.status).toBe(502)
  expect(await response.text()).toContain("Enter its final stream URL")
})

test("requires an allowlisted app origin", async () => {
  const handler = createCameraRelayHandler({ allowedOrigins: [] })
  const request = relayRequest("http://esp32.local/stream", {
    Origin: "http://untrusted.example",
  })

  const response = await handler(request)

  expect(response.status).toBe(403)
})
