import type { ReactNode } from "react"

export type Theme = "dark" | "light" | "system"
export type ResolvedTheme = "dark" | "light"

export type ThemeProviderProps = {
  children: ReactNode
  defaultTheme?: Theme
  forcedTheme?: ResolvedTheme
  storageKey?: string
}

export type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}
