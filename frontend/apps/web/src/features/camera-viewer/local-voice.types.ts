export type VoiceAvailability =
  "available" | "downloadable" | "downloading" | "unavailable"
export type VoiceOptions = { langs: string[]; processLocally: true }
export type VoiceResult = {
  isFinal: boolean
  [index: number]: { transcript: string }
}
export type VoiceResultEvent = {
  resultIndex: number
  results: ArrayLike<VoiceResult>
}
export type LocalRecognition = {
  processLocally?: boolean
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: VoiceResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onstart: (() => void) | null
  onend: (() => void) | null
  start: () => void
  abort: () => void
}
export type LocalRecognitionConstructor = {
  new (): LocalRecognition
  available?: (options: VoiceOptions) => Promise<VoiceAvailability>
  install?: (options: { langs: string[] }) => Promise<boolean>
}
export type SpeechWindow = Window & {
  SpeechRecognition?: LocalRecognitionConstructor
  webkitSpeechRecognition?: LocalRecognitionConstructor
}
export type LocalVoiceSnapshot = {
  status:
    | "idle"
    | "checking"
    | "downloading"
    | "starting"
    | "listening"
    | "error"
    | "unavailable"
  message: string
  canInstall: boolean
}
