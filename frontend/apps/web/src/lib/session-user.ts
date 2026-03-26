import type { SessionData } from "@/types/auth"

export function extractSessionUser(value: unknown): SessionData {
  if (typeof value !== "object" || value === null) {
    return null
  }

  const raw = value as { user?: unknown }
  if (typeof raw.user !== "object" || raw.user === null) {
    return null
  }

  const user = raw.user as {
    id?: unknown
    email?: unknown
    name?: unknown
  }

  if (typeof user.id !== "string" || typeof user.email !== "string") {
    return null
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: typeof user.name === "string" ? user.name : null,
    },
  }
}
