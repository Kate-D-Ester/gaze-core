import {
  Smartphone,
  Camera,
  ScanEye,
  SwitchCamera,
  ScanFace,
  Crosshair,
  CheckCircle2,
  Gauge,
} from "lucide-react"
import type { RemoteModeOption, RemoteSetupStep } from "./remote-setup.types"
export const REMOTE_MODES: readonly RemoteModeOption[] = [
  {
    id: "mobile",
    title: "Mobile eye tracker",
    short: "Mobile",
    icon: Smartphone,
    hint: "Track with your phone’s selfie camera.",
    preparation: "Rest your phone on a support. Keep both eyes visible.",
  },
  {
    id: "webcam",
    title: "Webcam-based eye tracker",
    short: "Webcam",
    icon: Camera,
    hint: "Use a laptop or USB webcam.",
    preparation: "Place the camera above your screen. Keep both eyes visible.",
  },
  {
    id: "ir",
    title: "IR webcam-based eye tracker",
    short: "IR camera",
    icon: ScanEye,
    hint: "Automatically locate eyes and measure IR pupils.",
    preparation:
      "Keep your face visible. Eyes and pupil thresholds are automatic.",
  },
]
export const REMOTE_STEPS: readonly RemoteSetupStep[] = [
  { label: "Choose", icon: SwitchCamera },
  { label: "Camera", icon: Camera },
  { label: "Position", icon: ScanFace },
  { label: "Calibrate", icon: Crosshair },
  { label: "Validate", icon: CheckCircle2 },
  { label: "Results", icon: Gauge },
]
