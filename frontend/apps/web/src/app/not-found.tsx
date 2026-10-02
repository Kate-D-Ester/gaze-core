import Link from "next/link"

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-content-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link href="/dashboard" className="text-sm underline underline-offset-4">
        Return to dashboard
      </Link>
    </main>
  )
}
