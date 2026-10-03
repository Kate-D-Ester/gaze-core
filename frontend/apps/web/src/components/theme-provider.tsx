"use client"
import * as React from "react"
import type {
  ResolvedTheme,
  Theme,
  ThemeProviderProps,
  ThemeProviderState,
} from "./theme-provider.types"

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined)

function isTheme(value: string | null): value is Theme {
  if (value === null) {
    return false
  }

  return value === "dark" || value === "light" || value === "system"
}

function getSystemTheme(): ResolvedTheme {
  if (window.matchMedia(COLOR_SCHEME_QUERY).matches) {
    return "dark"
  }

  return "light"
}

function saveTheme(storageKey: string, theme: Theme) {
  try {
    localStorage.setItem(storageKey, theme)
  } catch {
    // Themes still work when browser storage is unavailable.
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  forcedTheme,
  storageKey = "gazecore-theme",
  ...props
}: ThemeProviderProps) {
  const [preferredTheme, setThemeState] = React.useState<Theme>(defaultTheme)
  const theme = forcedTheme ?? preferredTheme

  React.useEffect(() => {
    try {
      const storedTheme = localStorage.getItem(storageKey)
      if (isTheme(storedTheme)) {
        setThemeState(storedTheme)
      }
    } catch {
      // Keep the default when storage is disabled.
    }
  }, [storageKey])

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      if (forcedTheme) {
        return
      }
      saveTheme(storageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [forcedTheme, storageKey]
  )

  const applyTheme = React.useCallback((nextTheme: Theme) => {
    const root = document.documentElement
    const resolvedTheme = nextTheme === "system" ? getSystemTheme() : nextTheme
    root.classList.remove("light", "dark")
    root.classList.add(resolvedTheme)
  }, [])

  React.useEffect(() => {
    applyTheme(theme)

    if (theme !== "system") {
      return undefined
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = () => {
      applyTheme("system")
    }

    mediaQuery.addEventListener("change", handleChange)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  }, [theme, applyTheme])

  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return
      }

      if (isTheme(event.newValue)) {
        setThemeState(event.newValue)
        return
      }

      setThemeState(defaultTheme)
    }

    window.addEventListener("storage", handleStorageChange)

    return () => {
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [defaultTheme, storageKey])

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}
