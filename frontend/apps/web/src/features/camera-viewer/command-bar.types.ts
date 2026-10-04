import type { LocalVoiceSnapshot } from "./local-voice.types"
export type CommandBarProps = {
  activeLabel: string
  canCapture: boolean
  capturing: boolean
  feedback: string
  commandError: boolean
  voice: LocalVoiceSnapshot
  onCommand: (text: string) => void
  onVoiceStart: () => void
  onVoiceStop: () => void
}
