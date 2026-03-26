type RawAuthError = {
  status?: number
  statusCode?: number
  statusText?: string
  message?: string
  data?: { message?: string }
  error?:
    | string
    | {
      message?: string
      status?: number
      statusCode?: number
    }
}

export type ParsedAuthError = {
  status: number | null
  message: string
}

export function parseAuthError(input: unknown): ParsedAuthError {
  if (typeof input !== "object" || input === null) {
    return { status: null, message: "" }
  }

  const raw = input as RawAuthError

  const status =
    typeof raw.status === "number"
      ? raw.status
      : typeof raw.statusCode === "number"
        ? raw.statusCode
        : typeof raw.error === "object" && raw.error !== null && typeof raw.error.status === "number"
          ? raw.error.status
          : typeof raw.error === "object" && raw.error !== null && typeof raw.error.statusCode === "number"
            ? raw.error.statusCode
            : null

  const message =
    typeof raw.error === "string"
      ? raw.error
      : typeof raw.error === "object" && raw.error !== null && typeof raw.error.message === "string"
        ? raw.error.message
        : typeof raw.data?.message === "string"
          ? raw.data.message
          : typeof raw.message === "string"
            ? raw.message
            : typeof raw.statusText === "string"
              ? raw.statusText
              : ""

  return { status, message }
}

export function getBackendAuthMessage(parsed: ParsedAuthError): string {
  return parsed.message.trim()
}