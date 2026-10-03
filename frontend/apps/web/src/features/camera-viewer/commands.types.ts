export type CameraRole = "eye" | "scene" | "auxiliary"
export type ViewerCommand =
  | {
      kind: "select" | "clear" | "photo" | "next-camera" | "stop" | "voice-stop"
    }
  | { kind: "camera"; role: CameraRole }
