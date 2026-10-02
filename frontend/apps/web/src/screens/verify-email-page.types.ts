export type EmailVerificationStatus = "loading" | "success" | "error"

export type EmailVerificationRequest = {
  token: string
  response: Promise<Response>
}
