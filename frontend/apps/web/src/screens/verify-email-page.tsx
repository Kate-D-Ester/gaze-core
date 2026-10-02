import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { authClient } from "@/lib/auth-client"
import { getBackendBaseUrl } from "@/lib/backend-base-url"
import { clearLegacySignInCredentials } from "@/lib/legacy-sign-in-cleanup"
import type {
  EmailVerificationRequest,
  EmailVerificationStatus,
} from "./verify-email-page.types"

export function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<EmailVerificationStatus>("loading")
  const [message, setMessage] = useState("")
  const request = useRef<EmailVerificationRequest | null>(null)
  const token = searchParams.get("token")

  useEffect(() => {
    clearLegacySignInCredentials()
    let active = true
    let redirectTimer: ReturnType<typeof setTimeout> | undefined

    async function verifyEmail() {
      if (!token) {
        setStatus("error")
        setMessage("Verification token is missing.")
        return
      }
      try {
        // Reuse the in-flight request during React's effect replay. Verification
        // tokens are single-use and must not be submitted twice on initial mount.
        if (request.current?.token !== token) {
          request.current = {
            token,
            response: fetch(
              `${getBackendBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
              {
                credentials: "include",
              }
            ),
          }
        }
        const response = await request.current.response
        if (!active) {
          return
        }
        if (!response.ok) {
          setStatus("error")
          setMessage(
            "Verification failed. The link may have expired or already been used."
          )
          return
        }
        const session = await authClient.getSession()
        if (!active) {
          return
        }
        let destination = "/auth"
        let successMessage = "Email verified. Sign in to continue."
        if (session.data?.user?.id) {
          destination = "/dashboard"
          successMessage = "Email verified. Opening your dashboard…"
        }
        setStatus("success")
        setMessage(successMessage)
        redirectTimer = setTimeout(() => router.replace(destination), 1000)
      } catch {
        if (active) {
          setStatus("error")
          setMessage("Could not verify your email. Try the link again.")
        }
      }
    }

    void verifyEmail()
    return () => {
      active = false
      clearTimeout(redirectTimer)
    }
  }, [token, router])

  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <section className="w-full max-w-md rounded-xl border bg-card p-6">
        <h1 className="text-xl font-semibold">Verify your email</h1>
        {status === "loading" && (
          <div className="mt-6 space-y-4" role="status">
            <div className="h-2 w-full animate-pulse rounded bg-muted" />
            <p className="text-sm text-muted-foreground">
              Verifying your email…
            </p>
          </div>
        )}
        {status !== "loading" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm" role="status">
              {message}
            </p>
            <Button onClick={() => router.replace("/auth")} className="w-full">
              Go to sign in
            </Button>
          </div>
        )}
      </section>
    </main>
  )
}
