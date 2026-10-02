import type { CameraRelayOptions } from "./camera-relay-server.types"
export type { CameraRelayOptions } from "./camera-relay-server.types"
const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:4014",
  "http://localhost:4014",
  "http://127.0.0.1:4001",
  "http://localhost:4001",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]
export function createCameraRelayHandler(options: CameraRelayOptions = {}) {
  const allowedOrigins = new Set(
    options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS
  )
  const fetcher = options.fetcher ?? fetch
  return async (request: Request): Promise<Response> => {
    const requestUrl = new URL(request.url)
    if (requestUrl.pathname === "/health" && request.method === "GET") {
      return Response.json({ ok: true, service: "camera-relay" })
    }
    if (requestUrl.pathname !== "/stream") {
      return new Response("Not found", { status: 404 })
    }
    const origin = request.headers.get("origin")
    if (!origin || !allowedOrigins.has(origin)) {
      return new Response(
        "This app origin is not allowed by the camera relay.",
        {
          status: 403,
        }
      )
    }
    const corsHeaders = createCorsHeaders(origin)
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders })
    }
    if (request.method !== "GET") {
      return jsonError(
        "Only GET is supported for camera streams.",
        405,
        corsHeaders
      )
    }
    const cameraUrl = parseCameraUrl(requestUrl.searchParams.get("url"))
    if (!cameraUrl) {
      return jsonError(
        "Use an HTTP camera URL with a .local hostname or private LAN IP address.",
        400,
        corsHeaders
      )
    }
    const upstreamHeaders = new Headers({ Accept: "*/*" })
    const range = request.headers.get("range")
    if (range) {
      upstreamHeaders.set("Range", range)
    }
    let upstream: Response
    try {
      upstream = await fetcher(cameraUrl.href, {
        headers: upstreamHeaders,
        redirect: "manual",
        signal: request.signal,
      })
    } catch (error) {
      if (request.signal.aborted) {
        return new Response(null, { status: 499 })
      }
      const message =
        error instanceof Error ? error.message : "Camera connection failed."
      return jsonError(
        `The camera relay could not reach the camera: ${message}`,
        502,
        corsHeaders
      )
    }
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel().catch(() => {})
      return jsonError(
        "The camera redirected the stream. Enter its final stream URL directly.",
        502,
        corsHeaders
      )
    }
    const headers = new Headers(corsHeaders)
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") ?? "application/octet-stream"
    )
    for (const name of ["content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(name)
      if (value) {
        headers.set(name, value)
      }
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    })
  }
}
function parseCameraUrl(input: string | null): URL | null {
  if (!input) {
    return null
  }
  try {
    const url = new URL(input)
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      !isLocalCameraHost(url.hostname)
    ) {
      return null
    }
    return url
  } catch {
    return null
  }
}
function isLocalCameraHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "")
  if (host.endsWith(".local")) {
    return true
  }
  const octets = host.split(".").map(Number)
  if (
    octets.length === 4 &&
    octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  ) {
    const [first, second] = octets
    return (
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    )
  }
  const ipv6 =
    host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host
  return /^(fc|fd)[0-9a-f]{0,2}:/i.test(ipv6)
}
function createCorsHeaders(origin: string): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Range",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, Accept-Ranges",
    "Cache-Control": "no-store",
    Vary: "Origin",
  })
}
function jsonError(
  message: string,
  status: number,
  headers: Headers
): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set("Content-Type", "application/json; charset=utf-8")
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: responseHeaders,
  })
}
