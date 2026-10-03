import { useEffect, useMemo, useState } from "react"
import type {
  CameraSourceKind,
  CameraSourcePreferenceController,
  CameraSourcePreferences,
  CameraSourceRole,
  CameraSourceSnapshot,
} from "./use-camera-source-preferences.types"
const DEFAULT_PREFERENCES: CameraSourcePreferences = {
  kind: "usb",
  url: "",
  deviceId: "",
}
function readCameraSourcePreferences(
  key: string,
  fallbackKey?: string
): CameraSourcePreferences {
  try {
    let serialized = globalThis.localStorage?.getItem(key)
    if (!serialized && fallbackKey) {
      serialized = globalThis.localStorage?.getItem(fallbackKey)
    }
    if (!serialized) {
      return DEFAULT_PREFERENCES
    }
    const value: unknown = JSON.parse(serialized)
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return DEFAULT_PREFERENCES
    }
    let kind: CameraSourceKind = "usb"
    let url = ""
    let deviceId = ""
    if ("kind" in value && value.kind === "network") {
      kind = "network"
    }
    if ("url" in value && typeof value.url === "string") {
      url = value.url
    }
    if ("deviceId" in value && typeof value.deviceId === "string") {
      deviceId = value.deviceId
    }
    return { kind, url, deviceId }
  } catch {
    return DEFAULT_PREFERENCES
  }
}
function preferencesForSource(
  saved: CameraSourcePreferences,
  source?: CameraSourceSnapshot | null
): CameraSourcePreferences {
  if (!source) {
    return saved
  }
  return {
    ...saved,
    kind: source.kind === "network" ? "network" : "usb",
    url: source.url ?? saved.url,
    deviceId: source.deviceId ?? saved.deviceId,
  }
}
/** Credential-bearing stream URLs stay in the current session only. */
export function cameraSourceUrlForStorage(input: string): string {
  try {
    const url = new URL(input)
    if (url.username || url.password || url.search || url.hash) {
      return ""
    }
    return input
  } catch {
    return ""
  }
}
export function useCameraSourcePreferences(
  role: CameraSourceRole = "eye",
  source?: CameraSourceSnapshot | null
): CameraSourcePreferenceController {
  const key = `gazecore.${role}-camera.source.v1`
  const saved = useMemo(() => {
    // Scene and screen formerly shared one eye-camera preference.
    const fallbackKey =
      role === "scene-eye" ? "gazecore.eye-camera.source.v1" : undefined
    return readCameraSourcePreferences(key, fallbackKey)
  }, [key, role])
  const sourceIdentity = JSON.stringify([
    source?.kind,
    source?.url,
    source?.deviceId,
  ])
  const [selection, setSelection] = useState(() => ({
    key,
    sourceIdentity,
    preferences: preferencesForSource(saved, source),
  }))
  // Synchronize a changed connection without overwriting edits on ordinary frames.
  // Adjusting this component's state during render avoids a stale commit/effect.
  if (selection.key !== key || selection.sourceIdentity !== sourceIdentity) {
    const previous = selection.key === key ? selection.preferences : saved
    setSelection({
      key,
      sourceIdentity,
      preferences: preferencesForSource(previous, source),
    })
  }
  const preferences = selection.key === key ? selection.preferences : saved
  function updatePreferences(patch: Partial<CameraSourcePreferences>): void {
    setSelection((current) => {
      const previous = current.key === key ? current.preferences : saved
      return { key, sourceIdentity, preferences: { ...previous, ...patch } }
    })
  }
  useEffect(() => {
    try {
      const stored = {
        ...preferences,
        url: cameraSourceUrlForStorage(preferences.url),
      }
      globalThis.localStorage?.setItem(key, JSON.stringify(stored))
    } catch {
      // Camera controls remain usable when browser storage is unavailable.
    }
  }, [key, preferences])
  function setKind(kind: CameraSourceKind): void {
    updatePreferences({ kind })
  }
  function setUrl(url: string): void {
    updatePreferences({ url })
  }
  function setDeviceId(deviceId: string): void {
    updatePreferences({ deviceId })
  }
  return { ...preferences, setKind, setUrl, setDeviceId }
}
