import { Elysia, t } from "elysia"
import { validateGazeApiKey, GazeApiKeyError } from "../lib/gaze-api-key"
import { buildWebSocketUrlFromRequest, gazeConfig } from "../lib/gaze-config"
import { deriveTestUuidFromEmail } from "../lib/gaze-email-uuid"
import { issueGazeAccessToken } from "../lib/gaze-token"

const testTokenIssuerBodySchema = t.Object({
  apiKey: t.String({ minLength: 1 }),
  email: t.String({ minLength: 3 }),
})

function errorResponse(error: string, message: string) {
  return { error, message }
}

export const gazeTestRoutes = new Elysia({ prefix: "/gaze/test/validate" })
  .post(
    "/uuid",
    async ({ body, request, set }) => {
      try {
        const apiKeyRecord = await validateGazeApiKey(body.apiKey)
        const identity = deriveTestUuidFromEmail(body.email)

        const issuedToken = issueGazeAccessToken({
          uuid: identity.uuid,
          apiKeyId: apiKeyRecord.id,
          referenceId: apiKeyRecord.referenceId,
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
        if (error instanceof GazeApiKeyError) {
          set.status = error.status
          return errorResponse(error.code, error.message)
        }

        const message = error instanceof Error ? error.message : "Unable to issue a test websocket access token."
        console.error("[GAZE] test token issuer failed:", error)
        set.status = 500
        return errorResponse("TEST_TOKEN_ISSUER_FAILED", message)
      }
    },
    {
      body: testTokenIssuerBodySchema,
      detail: {
        tags: ["Gaze Test"],
      },
    },
  )
