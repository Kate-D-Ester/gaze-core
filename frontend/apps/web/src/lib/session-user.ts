import type { SessionData } from "@/lib/auth.types"
import type {
  UnvalidatedSession,
  UnvalidatedSessionUser,
} from "./session-user.types"
export function extractSessionUser(value: unknown): SessionData {
  if (typeof value !== "object" || value === null) {
    return null
  }
  const raw = value as UnvalidatedSession
  if (typeof raw.user !== "object" || raw.user === null) {
    return null
  }
  const user = raw.user as UnvalidatedSessionUser
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
