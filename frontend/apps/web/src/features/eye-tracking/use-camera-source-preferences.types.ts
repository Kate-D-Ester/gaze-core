export type CameraSourceKind = "usb" | "network"

export type CameraSourcePreferences = {
  kind: CameraSourceKind
  url: string
}

export type CameraSourcePreferenceController = CameraSourcePreferences & {
  setKind: (kind: CameraSourceKind) => void
  setUrl: (url: string) => void
}
