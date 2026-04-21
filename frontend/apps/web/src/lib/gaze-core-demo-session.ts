export type GazeCoreDemoSession = {
  email: string
  uuid: string
  token: string
  expiresAt: string
  expiresInSeconds: number
  websocketUrl?: string
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/g, "")
  if (!trimmed) {
    throw new Error("A backend base URL is required.")
  }

  return trimmed
}

function buildTestUuidRouteUrl(baseUrl: string) {
  return new URL("/api/gaze/test/validate/uuid", `${normalizeBaseUrl(baseUrl)}/`).toString()
}

function extractErrorMessage(payload: unknown, fallbackMessage: string) {
  if (!payload || typeof payload !== "object") return fallbackMessage

  const record = payload as Record<string, unknown>
  if (typeof record.message === "string" && record.message.trim()) return record.message
  if (typeof record.error === "string" && record.error.trim()) return record.error
  return fallbackMessage
}

export async function issueDemoGazeSession(input: {
  backendBaseUrl: string
}) {
  const response = await fetch(buildTestUuidRouteUrl(input.backendBaseUrl), {
    method: "POST",
    credentials: "include",
  })

  const payload = await response.json().catch(() => null) as GazeCoreDemoSession | { message?: string; error?: string } | null
  if (!response.ok || !payload || typeof payload !== "object" || !("token" in payload) || typeof payload.token !== "string" || !("uuid" in payload) || typeof payload.uuid !== "string") {
    throw new Error(extractErrorMessage(payload, "Unable to issue the demo gaze session."))
  }

  return payload as GazeCoreDemoSession
}
