"use client"
import dynamic from "next/dynamic"
const SpeakerFocusPage = dynamic(
  () =>
    import("@/screens/speaker-focus-page").then(
      (module) => module.SpeakerFocusPage
    ),
  {
    ssr: false,
    loading: () => (
      <main
        role="status"
        className="grid min-h-svh place-items-center bg-background text-sm text-foreground"
      >
        Loading speaker focus…
      </main>
    ),
  }
)
export function SpeakerFocusClient() {
  return <SpeakerFocusPage />
}
