import { useEffect, useState } from "react"

type SourcePreference = { kind: "usb" | "network"; url: string }

export function useCameraSourcePreferences(
  role: "eye" | "scene",
  source?: { kind: string; url?: string } | null
) {
  const key = `gazecore.${role}-camera.source.v1`
  const [preference, setPreference] = useState<SourcePreference>(() => {
    let saved: Partial<SourcePreference> = {}
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "null")
      if (value && typeof value === "object") saved = value
    } catch {
      /* Storage may be unavailable or contain an old value. */
    }
    let kind = saved.kind
    if (source) kind = source.kind === "network" ? "network" : "usb"
    return {
      kind: kind === "network" ? "network" : "usb",
      url: source?.url ?? (typeof saved.url === "string" ? saved.url : ""),
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(preference))
    } catch {
      /* Keep the camera usable when browser storage is blocked. */
    }
  }, [key, preference])
  return {
    ...preference,
    setKind: (kind: SourcePreference["kind"]) =>
      setPreference((current) => ({ ...current, kind })),
    setUrl: (url: string) => setPreference((current) => ({ ...current, url })),
  }
}
