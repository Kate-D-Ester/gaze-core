import { Elysia, t } from "elysia"
import { validateGazeApiKey, GazeApiKeyError } from "../lib/gaze-api-key"
import { buildWebSocketUrlFromRequest, gazeConfig } from "../lib/gaze-config"
import { solveGazePoint } from "../lib/gaze-fusion"
import { gazeMqttBridge } from "../lib/gaze-mqtt"
import { gazeSessionStore } from "../lib/gaze-session-store"
import { extractBearerToken, GazeTokenError, issueGazeAccessToken, verifyGazeAccessToken } from "../lib/gaze-token"
import type { CalibrationPayload, GazeVectorPayload, GyroReading, SessionInitPayload } from "../lib/gaze-types"

const tokenBodySchema = t.Object({
  apiKey: t.String({ minLength: 1 }),
  metadata: t.Object({
    uuid: t.String({ minLength: 1 }),
  }),
})

function errorResponse(error: string, message: string) {
  return { error, message }
}

function parseJsonMessage(rawMessage: unknown) {
  if (typeof rawMessage !== "string") {
    throw new Error("WebSocket payload must be text JSON.")
  }

  const parsed = JSON.parse(rawMessage) as unknown
  if (!parsed || typeof parsed !== "object") {
    throw new Error("WebSocket payload must be a JSON object.")
  }

  return parsed as Record<string, unknown>
}

function isCalibrationPayload(value: unknown): value is CalibrationPayload {
  if (!value || typeof value !== "object") return false

  const record = value as Record<string, unknown>
  if (!record.screen || !record.points) return false

  const screen = record.screen as Record<string, unknown>
  return typeof record.version === "number"
    && typeof record.createdAt === "number"
    && typeof screen.width === "number"
    && typeof screen.height === "number"
    && Array.isArray(record.points)
}

function isGyroReading(value: unknown): value is GyroReading {
  if (!value || typeof value !== "object") return false

  const record = value as Record<string, unknown>
  return typeof record.yaw === "number"
    && typeof record.pitch === "number"
    && typeof record.roll === "number"
}

function parseSessionInitMessage(payload: Record<string, unknown>): SessionInitPayload | null {
  const type = typeof payload.type === "string" ? payload.type.trim().toLowerCase() : ""
  if (type !== "session.init" && type !== "live_preview_init") return null

  if (!isCalibrationPayload(payload.calibration)) {
    throw new Error("Calibration payload is required before live preview can start.")
  }

  const gyroZeroSnapshot = payload.gyroZeroSnapshot
  if (gyroZeroSnapshot !== undefined && gyroZeroSnapshot !== null && !isGyroReading(gyroZeroSnapshot)) {
    throw new Error("Gyro zero snapshot payload is invalid.")
  }

  return {
    calibration: payload.calibration,
    gyroZeroSnapshot: (gyroZeroSnapshot as GyroReading | null | undefined) ?? null,
  }
}

function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
}

function parseGazeVectorMessage(payload: Record<string, unknown>): GazeVectorPayload | null {
  const type = typeof payload.type === "string" ? payload.type.trim().toLowerCase() : ""
  if (type !== "gaze_vector") return null

  if (!isVector3(payload.gazeVector)) {
    throw new Error("gazeVector must be a [x, y, z] tuple.")
  }

  return {
    gazeVector: payload.gazeVector,
    pupilCenter: Array.isArray(payload.pupilCenter) && payload.pupilCenter.length === 2
      ? payload.pupilCenter as [number, number]
      : undefined,
    timestamp: typeof payload.timestamp === "number" ? payload.timestamp : undefined,
  }
}

function parseSocketToken(ws: { data: unknown }) {
  const data = ws.data as { query?: { token?: string } }
  const token = data.query?.token?.trim()
  if (!token) {
    throw new GazeTokenError("Missing websocket token.", 401, "MISSING_TOKEN")
  }

  return token
}

function sendSocketJson(ws: { send: (payload: string) => void }, payload: Record<string, unknown>) {
  ws.send(JSON.stringify(payload))
}

export const gazeRoutes = new Elysia({ prefix: "/gaze" })
  .post(
    "/token",
    async ({ body, request, set }) => {
      try {
        const apiKeyRecord = await validateGazeApiKey(body.apiKey)
        const issuedToken = issueGazeAccessToken({
          uuid: body.metadata.uuid.trim(),
          apiKeyId: apiKeyRecord.id,
          referenceId: apiKeyRecord.referenceId,
        })

        gazeSessionStore.rememberIssuedToken(issuedToken.claims)

        return {
          token: issuedToken.token,
          uuid: issuedToken.claims.uuid,
          expiresAt: new Date(issuedToken.expiresAt).toISOString(),
          expiresInSeconds: gazeConfig.tokenTtlSeconds,
          websocketUrl: buildWebSocketUrlFromRequest(request),
        }
      } catch (error) {
        if (error instanceof GazeApiKeyError) {
          set.status = error.status
          return errorResponse(error.code, error.message)
        }

        console.error("[GAZE] token route failed:", error)
        set.status = 500
        return errorResponse("TOKEN_ROUTE_FAILED", "Unable to issue a websocket access token.")
      }
    },
    {
      body: tokenBodySchema,
      detail: {
        tags: ["Gaze"],
      },
    },
  )
  .post(
    "/gyro-snapshot",
    async ({ request, set }) => {
    try {
      const token = extractBearerToken(request.headers.get("authorization"))
      const claims = verifyGazeAccessToken(token ?? "")
      gazeSessionStore.rememberIssuedToken(claims)

      const snapshot = await gazeMqttBridge.awaitSnapshot(claims.uuid, gazeConfig.gyroSnapshotTimeoutMs)
      gazeSessionStore.rememberGyroZeroSnapshot(claims.jti, snapshot)

      return {
        uuid: claims.uuid,
        snapshot,
      }
    } catch (error) {
      if (error instanceof GazeTokenError) {
        set.status = error.status
        return errorResponse(error.code, error.message)
      }

      const message = error instanceof Error ? error.message : "Unable to capture the gyro snapshot."
      console.error("[GAZE] gyro snapshot failed:", error)
      set.status = 504
      return errorResponse("GYRO_SNAPSHOT_FAILED", message)
    }
    },
    {
      detail: {
        tags: ["Gaze"],
      },
    },
  )
  .ws("/ws", {
    async open(ws) {
      try {
        const token = parseSocketToken(ws)
        const claims = verifyGazeAccessToken(token)
        gazeSessionStore.rememberIssuedToken(claims)
        gazeSessionStore.openSession(ws.id, claims)

        const releaseGyroSubscription = await gazeMqttBridge.retainSubscription(claims.uuid)
        gazeSessionStore.setGyroRelease(ws.id, releaseGyroSubscription)

        sendSocketJson(ws, {
          type: "connected",
          uuid: claims.uuid,
          sessionId: ws.id,
        })
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unable to open live preview session."
        ws.close(4401, reason)
      }
    },
    message(ws, rawMessage) {
      const session = gazeSessionStore.getSession(ws.id)
      if (!session) {
        sendSocketJson(ws, {
          type: "error",
          op: "session",
          detail: "Live preview session was not initialized.",
        })
        return
      }

      try {
        const payload = parseJsonMessage(rawMessage)
        const sessionInit = parseSessionInitMessage(payload)
        if (sessionInit) {
          const initializedSession = gazeSessionStore.initializeSession(
            ws.id,
            sessionInit.calibration,
            sessionInit.gyroZeroSnapshot,
          )

          if (!initializedSession?.gyroZeroSnapshot) {
            sendSocketJson(ws, {
              type: "error",
              op: "session.init",
              detail: "Gyro zero snapshot is required before live preview can start.",
            })
            return
          }

          sendSocketJson(ws, {
            type: "ack",
            op: "session.init",
            data: {
              uuid: initializedSession.uuid,
              ready: true,
            },
          })
          return
        }

        const gazeVector = parseGazeVectorMessage(payload)
        if (gazeVector) {
          const updatedSession = gazeSessionStore.updateLatestGaze(ws.id, gazeVector)
          if (!updatedSession?.calibration || !updatedSession.gyroZeroSnapshot) {
            sendSocketJson(ws, {
              type: "error",
              op: "gaze_vector",
              detail: "Calibration bundle is missing. Send session.init before streaming gaze vectors.",
            })
            return
          }

          const currentGyro = gazeMqttBridge.latestReading(updatedSession.uuid)
          if (!currentGyro) {
            return
          }

          const solvedPoint = solveGazePoint({
            calibration: updatedSession.calibration,
            gazeVector: gazeVector.gazeVector,
            zeroSnapshot: updatedSession.gyroZeroSnapshot,
            currentGyro,
            previousPoint: updatedSession.lastPoint
              ? { x: updatedSession.lastPoint.x, y: updatedSession.lastPoint.y }
              : null,
          })

          if (!solvedPoint) return

          gazeSessionStore.updateLastPoint(ws.id, solvedPoint)
          sendSocketJson(ws, {
            type: "live_preview_point",
            x: solvedPoint.x,
            y: solvedPoint.y,
            timestamp: solvedPoint.timestamp,
            confidence: solvedPoint.confidence,
            payload: {
              coordinates: {
                x: solvedPoint.x,
                y: solvedPoint.y,
              },
              basePoint: solvedPoint.basePoint,
              gyroDelta: solvedPoint.gyroDelta,
              currentGyro,
            },
          })
          return
        }

        if ((payload.type as string | undefined)?.toLowerCase() === "ping") {
          sendSocketJson(ws, { type: "pong" })
          return
        }

        sendSocketJson(ws, {
          type: "error",
          op: "message",
          detail: "Unsupported websocket message type.",
        })
      } catch (error) {
        sendSocketJson(ws, {
          type: "error",
          op: "message",
          detail: error instanceof Error ? error.message : "Invalid websocket payload.",
        })
      }
    },
    close(ws) {
      gazeSessionStore.closeSession(ws.id)
    },
    detail: {
      tags: ["Gaze"],
    },
  })
