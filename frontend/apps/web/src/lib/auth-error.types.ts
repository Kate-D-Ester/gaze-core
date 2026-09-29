export type RawAuthError = {
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
