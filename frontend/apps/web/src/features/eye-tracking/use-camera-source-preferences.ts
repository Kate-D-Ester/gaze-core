import { useEffect, useState } from "react"
import type {
  CameraSourceKind,
  CameraSourcePreferenceController,
  CameraSourcePreferences,
} from "./use-camera-source-preferences.types"

const STORAGE_KEY = "gazecore.eye-camera.source.v1"
const DEFAULT_PREFERENCES: CameraSourcePreferences = {
  kind: "usb",
  url: "",
}

function readCameraSourcePreferences(): CameraSourcePreferences {
  try {
    const serialized = globalThis.localStorage?.getItem(STORAGE_KEY)
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

export function useCameraSourcePreferences(): CameraSourcePreferenceController {
  const [preferences, setPreferences] = useState(readCameraSourcePreferences)

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(preferences))
    } catch {
      // Camera controls remain usable when browser storage is unavailable.
    }
  }, [preferences])

  function setKind(kind: CameraSourceKind): void {
    setPreferences((current) => ({ ...current, kind }))
  }

  function setUrl(url: string): void {
    setPreferences((current) => ({ ...current, url }))
  }

  return { ...preferences, setKind, setUrl }
}
