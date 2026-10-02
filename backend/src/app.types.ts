import type { auth } from "./lib/auth"

export type AuthOpenApiSchema = Awaited<
  ReturnType<typeof auth.api.generateOpenAPISchema>
>
