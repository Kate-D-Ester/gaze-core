import { useEffect, useState } from "react"
import type {
  CameraSourceKind,
  CameraSourceRole,
  CameraSourceSnapshot,
  CameraSourcePreferenceController,
  CameraSourcePreferences,
} from "./use-camera-source-preferences.types"

const DEFAULT_PREFERENCES: CameraSourcePreferences = {
  kind: "usb",
  url: "",
}

function readCameraSourcePreferences(key: string): CameraSourcePreferences {
  try {
    const serialized = globalThis.localStorage?.getItem(key)
    if (!serialized) {
      return DEFAULT_PREFERENCES
    }

    const value: unknown = JSON.parse(serialized)
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return DEFAULT_PREFERENCES
    }

    let kind: CameraSourceKind = "usb"
    let url = ""
    if ("kind" in value && value.kind === "network") {
      kind = "network"
    }
    if ("url" in value && typeof value.url === "string") {
      url = value.url
    }

    return { kind, url }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function useCameraSourcePreferences(
  role: CameraSourceRole = "eye",
  source?: CameraSourceSnapshot | null
): CameraSourcePreferenceController {
  const key = `gazecore.${role}-camera.source.v1`
  const [preferences, setPreferences] = useState(() => {
    const saved = readCameraSourcePreferences(key)
    if (!source) return saved
    return {
      kind: source.kind === "network" ? ("network" as const) : ("usb" as const),
      url: source.url ?? saved.url,
    }
  })

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(preferences))
    } catch {
      // Camera controls remain usable when browser storage is unavailable.
    }
  }, [key, preferences])

  function setKind(kind: CameraSourceKind): void {
    setPreferences((current) => ({ ...current, kind }))
  }

  function setUrl(url: string): void {
    setPreferences((current) => ({ ...current, url }))
  }

  return { ...preferences, setKind, setUrl }
}
