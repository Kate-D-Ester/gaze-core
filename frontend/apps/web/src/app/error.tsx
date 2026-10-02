"use client"
import type { ErrorPageProps } from "./error.types"

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <main className="grid min-h-svh place-content-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">This view could not load</h1>
      <button
        onClick={reset}
        className="rounded-md bg-[#a8d8c6] px-4 py-2 text-[#10261d]"
      >
        Try again
      </button>
    </main>
  )
}
