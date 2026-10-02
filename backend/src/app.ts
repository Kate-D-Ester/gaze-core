import { swagger } from "@elysiajs/swagger"
import { Elysia } from "elysia"
import { auth } from "./lib/auth"
import type { AuthOpenApiSchema } from "./app.types"
import { createAuthPlugin } from "./lib/middleware"

function normalizeAuthOpenApiSchema(
  schema: AuthOpenApiSchema
) {
  const authPaths = Object.fromEntries(
    Object.entries(schema.paths ?? {}).map(([path, pathItem]) => [
      path,
      Object.fromEntries(
        Object.entries(pathItem ?? {}).map(([method, operation]) => {
          if (
            !operation ||
            typeof operation !== "object" ||
            Array.isArray(operation)
          ) {
            return [method, operation]
          }

          return [method, { ...operation, tags: ["Auth"] }]
        })
      ),
    ])
  )

  return {
    paths: authPaths,
    components: schema.components,
    tags: [
      {
        name: "Auth",
        description: "Authentication and account management endpoints",
      },
    ],
  }
}

const authOpenApiSchema = normalizeAuthOpenApiSchema(
  await auth.api.generateOpenAPISchema()
)

export function createApp() {
  return new Elysia()
    .onAfterHandle(({ request, response, set }) => {
      const url = new URL(request.url)
      let status = 200

      if (response instanceof Response) {
        status = response.status
      } else if (typeof set.status === "number") {
        status = set.status
      }

      console.log(`[REQ] ${request.method} ${url.pathname} -> ${status}`)
    })
    .use(createAuthPlugin())
    .use(
      swagger({
        path: "/swagger",
        documentation: {
          info: {
            title: "GazeCore API",
            version: "1.0.0",
            description: "Swagger UI for the GazeCore backend API.",
          },
          paths: authOpenApiSchema.paths,
          components: authOpenApiSchema.components as never,
          tags: [
            { name: "App", description: "Health and root endpoints" },
            ...authOpenApiSchema.tags,
          ],
        },
      })
    )
    .get(
      "/",
      () => ({
        message: "GazeCore Backend API",
        version: "1.0.0",
        status: "running",
      }),
      {
        detail: {
          tags: ["App"],
        },
      }
    )
    .get(
      "/health",
      () => ({
        status: "healthy",
        timestamp: new Date().toISOString(),
      }),
      {
        detail: {
          tags: ["App"],
        },
      }
    )
}
