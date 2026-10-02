import type { ParsedAuthError, RawAuthError } from "./auth-error.types"
export function parseAuthError(input: unknown): ParsedAuthError {
  if (typeof input !== "object" || input === null) {
    return { status: null, message: "" }
  }
  const raw = input as RawAuthError
  const nestedError =
    typeof raw.error === "object" && raw.error !== null ? raw.error : null
  let status: number | null = null
  if (typeof raw.status === "number") {
    status = raw.status
  } else if (typeof raw.statusCode === "number") {
    status = raw.statusCode
  } else if (typeof nestedError?.status === "number") {
    status = nestedError.status
  } else if (typeof nestedError?.statusCode === "number") {
    status = nestedError.statusCode
  }
  let message = ""
  if (typeof raw.error === "string") {
    message = raw.error
  } else if (typeof nestedError?.message === "string") {
    message = nestedError.message
  } else if (typeof raw.data?.message === "string") {
    message = raw.data.message
  } else if (typeof raw.message === "string") {
    message = raw.message
  } else if (typeof raw.statusText === "string") {
    message = raw.statusText
  }
  return { status, message }
}
export function getBackendAuthMessage(parsed: ParsedAuthError): string {
  return parsed.message.trim() || "Request failed. Please try again."
}
