import { Elysia, t } from "elysia"
import { auth } from "../lib/auth"
import { buildWebSocketUrlFromRequest, gazeConfig } from "../lib/gaze-config"
import { deriveTestUuidFromEmail } from "../lib/gaze-email-uuid"
import { issueGazeAccessToken } from "../lib/gaze-token"

function errorResponse(error: string, message: string) {
  return { error, message }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

async function resolveSessionUser(request: Request) {
  const sessionData = await auth.api.getSession({ headers: request.headers })
  return sessionData?.user ?? null
}

export const gazeTestRoutes = new Elysia({ prefix: "/gaze/test/validate" })
  .post(
    "/uuid",
    async ({ request, set }) => {
      try {
        const sessionUser = await resolveSessionUser(request)
        if (!sessionUser) {
          set.status = 401
          return errorResponse("UNAUTHORIZED", "Sign in required")
        }

        const normalizedEmail = normalizeEmail(sessionUser.email)
        if (!normalizedEmail) {
          set.status = 400
          return errorResponse("VALIDATION_ERROR", "Email is required.")
        }

        const identity = deriveTestUuidFromEmail(normalizedEmail)

        const issuedToken = issueGazeAccessToken({
          uuid: identity.uuid,
          apiKeyId: "session-user",
          referenceId: sessionUser.id,
        })

        return {
          email: identity.email,
          uuid: identity.uuid,
          token: issuedToken.token,
          expiresAt: new Date(issuedToken.expiresAt).toISOString(),
          expiresInSeconds: gazeConfig.tokenTtlSeconds,
          websocketUrl: buildWebSocketUrlFromRequest(request),
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to issue a test websocket access token."
        console.error("[GAZE] test token issuer failed:", error)
        set.status = 500
        return errorResponse("TEST_TOKEN_ISSUER_FAILED", message)
      }
    },
    {
      detail: {
        tags: ["Gaze Test"],
      },
      response: {
        400: t.Object({
          error: t.String(),
          message: t.String(),
        }),
        401: t.Object({
          error: t.String(),
          message: t.String(),
        }),
        500: t.Object({
          error: t.String(),
          message: t.String(),
        }),
      },
    },
  )
