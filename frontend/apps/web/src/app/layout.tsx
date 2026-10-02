import { RootThemeStyles } from "@/features/tracking-ui/theme-styles"
import type { Metadata } from "next"
import Script from "next/script"
import { BrowserMaintenance } from "@/components/browser-maintenance"
import { ThemeProvider } from "@/components/theme-provider"
import type { RootLayoutProps } from "./layout.types"
import "@workspace/ui/globals.css"

export const metadata: Metadata = {
  title: "GazeCore · Eye Tracking",
  description:
    "Screen, remote and scene eye tracking processed in your browser.",
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      className={`dark ${RootThemeStyles}`}
      suppressHydrationWarning
    >
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
        <ThemeProvider>
          <BrowserMaintenance />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
