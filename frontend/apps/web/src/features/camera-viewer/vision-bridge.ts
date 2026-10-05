import type { VisionConfiguration } from "./vision-bridge.types"

const MAX_BODY = 2 * 1024 * 1024
const error = (message: string, status: number) =>
  Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  )

export async function proxyVision(
  request: Request,
  configuration: VisionConfiguration
) {
  const serverUrl = new URL(request.url)
  // Next can internally rewrite 127.0.0.1 to localhost. The browser Host
  // remains authoritative, and the allowlist also rejects DNS rebinding.
  const origin = new URL(
    `${serverUrl.protocol}//${request.headers.get("host") ?? serverUrl.host}`
  )
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
    request.headers.get("origin") !== origin.origin
  ) {
    return error("Only same-origin camera requests are allowed.", 403)
  }
  const endpoint = configuration.url
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint) || !configuration.secret) {
    return error(
      "Tracking unavailable. Run vision setup and restart the app server.",
      503
    )
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return error("Expected a camera JSON request.", 400)
  }
  const length = Number(request.headers.get("content-length") ?? 0)
  if (!Number.isFinite(length) || length < 0 || length > MAX_BODY) {
    return error("Camera request is too large.", 413)
  }
  const reader = request.body?.getReader()
  if (!reader) {
    return error("Camera request is empty.", 400)
  }
  try {
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      total += value.byteLength
      if (total > MAX_BODY) {
        await reader.cancel()
        return error("Camera request is too large.", 413)
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (
      !body ||
      typeof body !== "object" ||
      !("action" in body) ||
      !["status", "select", "track", "match", "clear"].includes(String(body.action))
    ) {
      return error("Unknown vision action.", 400)
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${configuration.secret}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
      redirect: "error",
    })
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    })
  } catch (failure) {
    if (failure instanceof SyntaxError) {
      return error("Invalid camera request.", 400)
    }
    return error("Tracking connection unavailable. Retry Select.", 503)
  } finally {
    reader.releaseLock()
  }
}
