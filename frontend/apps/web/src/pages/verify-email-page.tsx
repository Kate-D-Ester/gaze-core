import { useEffect, useState } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { Button } from "@workspace/ui/components/button"
import { authClient } from "@/lib/auth-client"

type VerifyEmailPageProps = {
  onVerified?: () => void
}

export function VerifyEmailPage({ onVerified }: VerifyEmailPageProps) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("")

  const token = searchParams.get("token")

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setStatus("error")
        setMessage("Verification token is missing.")
        return
      }

      try {
        const response = await fetch(`${import.meta.env.VITE_AUTH_BASE_URL || "http://localhost:3000"}/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
          method: "GET",
          credentials: "include",
        })

        if (response.ok) {
          const pendingEmail = localStorage.getItem("pendingSignInEmail")
          const pendingPassword = localStorage.getItem("pendingSignInPassword")

          if (pendingEmail && pendingPassword) {
            try {
              await authClient.signIn.email({
                email: pendingEmail,
                password: pendingPassword,
              })
              localStorage.removeItem("pendingSignInEmail")
              localStorage.removeItem("pendingSignInPassword")
              onVerified?.()
              setStatus("success")
              setMessage("✅ Email verified and signed in. Redirecting to dashboard...")
              setTimeout(() => navigate("/dashboard", { replace: true }), 800)
              return
            } catch {
              // Fallback below to session check and sign-in screen.
            }
          }

          const session = await authClient.getSession()
          if (session.data?.user?.id) {
            onVerified?.()
            setStatus("success")
            setMessage("✅ Email verified. Redirecting to dashboard...")
            setTimeout(() => navigate("/dashboard", { replace: true }), 800)
            return
          }

          setStatus("success")
          setMessage("✅ Email verified successfully! Redirecting to sign in...")
          setTimeout(() => navigate("/auth", { replace: true }), 1200)
        } else {
          let responseMessage = "Verification failed. Token may have expired."
          try {
            const error = await response.json()
            responseMessage = error.message || responseMessage
          } catch {
            // Keep default message when response is not JSON.
          }

          setStatus("error")
          setMessage(`❌ ${responseMessage}`)
        }
      } catch (err) {
        setStatus("error")
        setMessage("❌ An error occurred during verification.")
        console.error(err)
      }
    }

    verifyEmail()
  }, [token, navigate, onVerified])

  return (
    <main className="grid min-h-svh place-items-center bg-gradient-to-b from-background to-muted/40 p-6">
      <section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Verify Your Email</h1>

        {status === "loading" && (
          <div className="mt-6 space-y-4">
            <div className="h-2 w-full animate-pulse rounded bg-muted"></div>
            <p className="text-sm text-muted-foreground">Verifying your email...</p>
          </div>
        )}

        {status === "success" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-emerald-600">{message}</p>
            <Button onClick={() => navigate("/auth")} className="w-full">
              Go to Sign In
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-red-600">{message}</p>
            <Button onClick={() => navigate("/auth")} variant="outline" className="w-full">
              Back to Sign In
            </Button>
            <p className="text-xs text-muted-foreground">
              Check your spam folder or request a new verification email.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
