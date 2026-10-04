import type { AudioDevices } from "./audio-devices"
import type { AudioDeviceSnapshot } from "./audio-devices.types"
export type AudioDeviceControlsProps = {
  devices: AudioDevices
  snapshot: AudioDeviceSnapshot
  listening: boolean
  active: boolean
  onOutput: (id: string) => Promise<void>
}
