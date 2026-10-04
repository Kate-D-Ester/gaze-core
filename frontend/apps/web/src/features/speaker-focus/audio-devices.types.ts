export type AudioDeviceSelection = { microphoneId: string; outputId: string }
export type AudioDeviceSnapshot = {
  selection: AudioDeviceSelection
  inputs: MediaDeviceInfo[]
  outputs: MediaDeviceInfo[]
  outputSupported: boolean
  inputMissing: boolean
  outputMissing: boolean
  busy: boolean
  error: string
}
export type AudioDeviceOptions = {
  media?: MediaDevices
  storage?: Pick<Storage, "getItem" | "setItem">
  outputSupported?: boolean
}
export type RoutableAudioContext = AudioContext & {
  setSinkId?: (id: string) => Promise<void>
}
