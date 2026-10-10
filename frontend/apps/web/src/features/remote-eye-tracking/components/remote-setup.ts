import {
  Smartphone,
  Camera,
  ScanEye,
  SwitchCamera,
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
  { id: 0, label: "Choose", icon: SwitchCamera },
  { id: 1, label: "Camera", icon: Camera },
  { id: 3, label: "Calibrate", icon: Crosshair },
  { id: 4, label: "Check accuracy", icon: CheckCircle2 },
  { id: 5, label: "Results", icon: Gauge },
]
