import { buildSessionTokenRouteUrl, buildTokenRouteUrl } from "./routes"
import type { CachedAccessToken, GazeAccessTokenResponse } from "./types"

type TokenManagerConfig = {
  backendBaseUrl?: string
  apiKey?: string
  deviceUuid?: string
  initialToken?: string
  useSessionTokenIssuer?: boolean
}

function extractErrorMessage(payload: unknown, fallbackMessage: string) {
  if (!payload || typeof payload !== "object") return fallbackMessage

  const record = payload as Record<string, unknown>
  if (typeof record.message === "string" && record.message.trim()) return record.message
  if (typeof record.error === "string" && record.error.trim()) return record.error
  return fallbackMessage
}

async function requestApiKeyGazeAccessToken(config: Required<Pick<TokenManagerConfig, "backendBaseUrl" | "apiKey" | "deviceUuid">>) {
  const response = await fetch(buildTokenRouteUrl(config.backendBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apiKey: config.apiKey,
      metadata: {
        uuid: config.deviceUuid,
      },
    }),
  })

  const payload = await response.json().catch(() => null) as GazeAccessTokenResponse | { message?: string; error?: string } | null
  if (!response.ok || !payload || typeof payload !== "object" || !("token" in payload) || typeof payload.token !== "string") {
    throw new Error(extractErrorMessage(payload, "Unable to issue the websocket access token."))
  }

  const expiresAt = new Date(payload.expiresAt).getTime()
  if (!Number.isFinite(expiresAt)) {
    throw new Error("The backend returned an invalid websocket token expiry.")
  }

  return {
    token: payload.token,
    expiresAt,
  }
}

async function requestSessionGazeAccessToken(backendBaseUrl: string) {
  const response = await fetch(buildSessionTokenRouteUrl(backendBaseUrl), {
    method: "POST",
    credentials: "include",
  })

  const payload = await response.json().catch(() => null) as GazeAccessTokenResponse | { message?: string; error?: string } | null
  if (!response.ok || !payload || typeof payload !== "object" || !("token" in payload) || typeof payload.token !== "string") {
    throw new Error(extractErrorMessage(payload, "Unable to issue the websocket access token."))
  }

  const expiresAt = new Date(payload.expiresAt).getTime()
  if (!Number.isFinite(expiresAt)) {
    throw new Error("The backend returned an invalid websocket token expiry.")
  }

  return {
    token: payload.token,
    expiresAt,
  }
}

function shouldRefreshToken(tokenState: CachedAccessToken | null) {
  if (!tokenState) return true
  if (tokenState.source === "external") return false
  return tokenState.expiresAt - Date.now() <= 5000
}

export class GazeWidgetTokenManager {
  private config: TokenManagerConfig = {}
  private cachedToken: CachedAccessToken | null = null
  private pendingRefresh: Promise<CachedAccessToken> | null = null

  private hasApiKeyIssueConfig() {
    return Boolean(this.config.apiKey?.trim() && this.config.deviceUuid?.trim())
  }

  updateConfig(config: TokenManagerConfig) {
    this.config = config

    if (config.initialToken?.trim()) {
      this.cachedToken = {
        token: config.initialToken.trim(),
        expiresAt: Number.POSITIVE_INFINITY,
        source: "external",
      }
      return
    }

    if (this.cachedToken?.source === "external") {
      this.cachedToken = null
    }
  }

  canIssueToken() {
    return Boolean(this.config.backendBaseUrl?.trim())
      && (this.hasApiKeyIssueConfig() || this.config.useSessionTokenIssuer === true)
  }

  canAuthorize() {
    return Boolean(this.cachedToken?.token) || this.canIssueToken()
  }

  async ensureToken(forceRefresh = false) {
    if (!forceRefresh && !shouldRefreshToken(this.cachedToken) && this.cachedToken) {
      return this.cachedToken
    }

    if (!this.canIssueToken()) {
      if (this.cachedToken && !forceRefresh) return this.cachedToken
      throw new Error("A backend base URL and authenticated session or API key configuration are required for token authorization.")
    }

    if (!forceRefresh && this.pendingRefresh) {
      return this.pendingRefresh
    }

    const backendBaseUrl = this.config.backendBaseUrl!.trim()

    this.pendingRefresh = (this.hasApiKeyIssueConfig()
      ? requestApiKeyGazeAccessToken({
          backendBaseUrl,
          apiKey: this.config.apiKey!.trim(),
          deviceUuid: this.config.deviceUuid!.trim(),
        })
      : requestSessionGazeAccessToken(backendBaseUrl)
    ).then((issuedToken) => {
      const nextToken: CachedAccessToken = {
        token: issuedToken.token,
        expiresAt: issuedToken.expiresAt,
        source: "issued",
      }
      this.cachedToken = nextToken
      return nextToken
    }).finally(() => {
      this.pendingRefresh = null
    })

    return this.pendingRefresh
  }

  async authorizedFetch(makeRequest: (token: string) => Promise<Response>) {
    const firstToken = await this.ensureToken(false)
    let response = await makeRequest(firstToken.token)
    if (response.status !== 401 && response.status !== 403) {
      return response
    }

    const secondToken = await this.ensureToken(true)
    response = await makeRequest(secondToken.token)
    return response
  }
}
