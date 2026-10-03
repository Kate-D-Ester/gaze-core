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

for (const status of [301, 302, 303, 307, 308]) {
  test(`follows HTTP ${status} camera redirects and preserves video range headers`, async () => {
    const urls: string[] = []
    let cancelled = false
    const handler = createCameraRelayHandler({
      allowedOrigins: [appOrigin],
      fetcher: async (input, init) => {
        urls.push(String(input))
        expect(init?.redirect).toBe("manual")
        expect(new Headers(init?.headers).get("Range")).toBe("bytes=0-4")
        if (urls.length === 1) {
          return new Response(
            new ReadableStream({
              cancel() {
                cancelled = true
              },
            }),
            {
              status,
              headers: { Location: "../stream?camera=eye" },
            }
          )
        }
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
      relayRequest("http://esp32.local/camera/start", { Range: "bytes=0-4" })
    )

    expect(urls).toEqual([
      "http://esp32.local/camera/start",
      "http://esp32.local/stream?camera=eye",
    ])
    expect(cancelled).toBe(true)
    expect(response.status).toBe(206)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(appOrigin)
    expect(response.headers.get("Content-Type")).toBe("video/mp4")
    expect(response.headers.get("Content-Range")).toBe("bytes 0-4/10")
    expect(await response.text()).toBe("video")
  })
}

test("follows camera redirects across local names, ports and private addresses", async () => {
  const urls: string[] = []
  const handler = createCameraRelayHandler({
    allowedOrigins: [appOrigin],
    fetcher: async (input) => {
      urls.push(String(input))
      if (urls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { Location: "//esp32.local:81/stream" },
        })
      }
      if (urls.length === 2) {
        return new Response(null, {
          status: 307,
          headers: { Location: "http://192.168.1.20:81/live" },
        })
      }
      return new Response("frame", {
        headers: {
          "Content-Type": "multipart/x-mixed-replace; boundary=frame",
        },
      })
    },
  })

  const response = await handler(relayRequest("http://esp32.local/stream"))

  expect(urls).toEqual([
    "http://esp32.local/stream",
    "http://esp32.local:81/stream",
    "http://192.168.1.20:81/live",
  ])
  expect(response.status).toBe(200)
  expect(response.headers.get("Content-Type")).toContain(
    "multipart/x-mixed-replace"
  )
  expect(await response.text()).toBe("frame")
})

test("checks the destination again after an allowed redirect", async () => {
  const urls: string[] = []
  const handler = createCameraRelayHandler({
    fetcher: async (input) => {
      urls.push(String(input))
      return new Response(null, {
        status: 302,
        headers: {
          Location: urls.length === 1 ? "/live" : "http://127.0.0.1/private",
        },
      })
    },
  })

  const response = await handler(relayRequest("http://esp32.local/stream"))

  expect(response.status).toBe(502)
  expect(urls).toEqual(["http://esp32.local/stream", "http://esp32.local/live"])
})

test("opens the stream at the end of five redirects", async () => {
  let fetches = 0
  const handler = createCameraRelayHandler({
    fetcher: async () => {
      fetches++
      if (fetches <= 5) {
        return new Response(null, {
          status: 302,
          headers: { Location: `/stream/${fetches}` },
        })
      }
      return new Response("frame", {
        headers: {
          "Content-Type": "multipart/x-mixed-replace; boundary=frame",
        },
      })
    },
  })

  const response = await handler(relayRequest("http://esp32.local/stream"))

  expect(fetches).toBe(6)
  expect(response.status).toBe(200)
  expect(await response.text()).toBe("frame")
})

for (const location of [
  "https://example.com/stream",
  "http://127.0.0.1/private",
  "http://169.254.169.254/latest/meta-data",
  "http://user:password@esp32.local/stream",
  "ftp://esp32.local/stream",
  "http://[",
]) {
  test(`rejects an unsafe camera redirect to ${location} before following it`, async () => {
    let fetches = 0
    let cancelled = false
    const handler = createCameraRelayHandler({
      allowedOrigins: [appOrigin],
      fetcher: async () => {
        fetches++
        return new Response(
          new ReadableStream({
            cancel() {
              cancelled = true
            },
          }),
          {
            status: 302,
            headers: { Location: location },
          }
        )
      },
    })

    const response = await handler(relayRequest("http://esp32.local/stream"))

    expect(response.status).toBe(502)
    expect(fetches).toBe(1)
    expect(cancelled).toBe(true)
    expect(await response.text()).toMatch(/redirect.*local camera/i)
  })
}

test("reports a redirect without a destination", async () => {
  const handler = createCameraRelayHandler({
    fetcher: async () => new Response(null, { status: 302 }),
  })

  const response = await handler(relayRequest("http://esp32.local/stream"))

  expect(response.status).toBe(502)
  expect(await response.text()).toMatch(/redirect.*destination/i)
})

test("stops a redirect loop before requesting the same stream again", async () => {
  const urls: string[] = []
  const handler = createCameraRelayHandler({
    fetcher: async (input) => {
      const url = String(input)
      urls.push(url)
      return new Response(null, {
        status: 302,
        headers: {
          Location: url.endsWith("/stream") ? "/live" : "/stream#preview",
        },
      })
    },
  })

  const response = await handler(relayRequest("http://esp32.local/stream"))

  expect(response.status).toBe(502)
  expect(urls).toEqual(["http://esp32.local/stream", "http://esp32.local/live"])
  expect(await response.text()).toMatch(/redirect loop/i)
})

test("bounds a camera redirect chain even when every destination is different", async () => {
  let fetches = 0
  const handler = createCameraRelayHandler({
    fetcher: async () => {
      fetches++
      return new Response(null, {
        status: 302,
        headers: { Location: `/stream/${fetches}` },
      })
    },
  })

  const response = await handler(relayRequest("http://esp32.local/stream"))

  expect(response.status).toBe(502)
  expect(fetches).toBe(6)
  expect(await response.text()).toMatch(/too many.*redirect/i)
})

test("disconnecting during a redirect stops the next upstream request", async () => {
  const controller = new AbortController()
  let fetches = 0
  let cancelled = false
  const handler = createCameraRelayHandler({
    fetcher: async (_input, init) => {
      fetches++
      expect(init?.signal).toBe(controller.signal)
      controller.abort()
      return new Response(
        new ReadableStream({
          cancel() {
            cancelled = true
          },
        }),
        {
          status: 302,
          headers: { Location: "/live" },
        }
      )
    },
  })
  const request = relayRequest("http://esp32.local/stream")

  const response = await handler({ ...request, signal: controller.signal })

  expect(response.status).toBe(499)
  expect(fetches).toBe(1)
  expect(cancelled).toBe(true)
})

test("requires an allowlisted app origin", async () => {
  const handler = createCameraRelayHandler({ allowedOrigins: [] })
  const request = relayRequest("http://esp32.local/stream", {
    Origin: "http://untrusted.example",
  })

  const response = await handler(request)

  expect(response.status).toBe(403)
})
