import { supportsAudioOutputSelection } from "./audio-output"
import type {
  AudioDeviceOptions,
  AudioDeviceSelection,
  AudioDeviceSnapshot,
} from "./audio-devices.types"
const KEY = "gazecore.speaker-focus.audio-devices.v1"
const DEFAULT: AudioDeviceSelection = { microphoneId: "", outputId: "" }
export class AudioDevices {
  private snapshot: AudioDeviceSnapshot = {
    selection: DEFAULT,
    inputs: [],
    outputs: [],
    outputSupported: false,
    inputMissing: false,
    outputMissing: false,
    busy: false,
    error: "",
  }
  private listeners = new Set<() => void>()
  private active = false
  private epoch = 0
  private refreshId = 0
  private outputId = 0
  private inputsVisible = false
  private outputsVisible = false
  private media: MediaDevices | undefined
  private storage: AudioDeviceOptions["storage"]
  constructor(private readonly options: AudioDeviceOptions = {}) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(patch: Partial<AudioDeviceSnapshot>): void {
    if (!this.active) {
      return
    }
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((listener) => listener())
  }
  async mount(): Promise<void> {
    this.active = true
    this.epoch++
    this.inputsVisible = false
    this.outputsVisible = false
    this.media = this.options.media ?? navigator.mediaDevices
    try {
      this.storage = this.options.storage ?? globalThis.localStorage
    } catch {
      /* Device controls also work without storage. */
    }
    let selection = DEFAULT
    try {
      const raw: unknown = JSON.parse(this.storage?.getItem(KEY) ?? "null")
      if (
        raw &&
        typeof raw === "object" &&
        "microphoneId" in raw &&
        "outputId" in raw &&
        typeof raw.microphoneId === "string" &&
        typeof raw.outputId === "string"
      ) {
        selection = { microphoneId: raw.microphoneId, outputId: raw.outputId }
      }
    } catch {
      /* Ignore invalid saved device preferences. */
    }
    this.update({
      selection,
      busy: false,
      error: "",
      outputSupported:
        this.options.outputSupported ?? supportsAudioOutputSelection(),
    })
    this.media?.addEventListener("devicechange", this.devicesChanged)
    await this.refresh()
  }
  private devicesChanged = () => {
    void this.refresh()
  }
  async refresh(): Promise<void> {
    const epoch = this.epoch
    const request = ++this.refreshId
    try {
      const devices = (await this.media?.enumerateDevices()) ?? []
      if (!this.active || epoch !== this.epoch || request !== this.refreshId) {
        return
      }
      const inputs = devices.filter(
        (device) =>
          device.kind === "audioinput" &&
          device.deviceId &&
          device.deviceId !== "default" &&
          device.deviceId !== "communications"
      )
      const outputs = devices.filter(
        (device) =>
          device.kind === "audiooutput" &&
          device.deviceId &&
          device.deviceId !== "default" &&
          device.deviceId !== "communications"
      )
      // Hidden lists before permission cannot prove a remembered device is missing.
      this.inputsVisible ||= devices.some(
        (device) => device.kind === "audioinput" && !!device.label
      )
      this.outputsVisible ||= devices.some(
        (device) => device.kind === "audiooutput" && !!device.label
      )
      const selection = this.snapshot.selection
      this.update({
        inputs,
        outputs,
        inputMissing:
          this.inputsVisible &&
          !!selection.microphoneId &&
          !inputs.some((device) => device.deviceId === selection.microphoneId),
        outputMissing:
          this.outputsVisible &&
          !!selection.outputId &&
          !outputs.some((device) => device.deviceId === selection.outputId),
      })
    } catch {
      if (epoch === this.epoch) {
        this.update({
          error:
            "Audio devices could not be listed. Enable audio device access and try again.",
        })
      }
    }
  }
  async enable(): Promise<void> {
    if (!this.active || this.snapshot.busy) {
      return
    }
    const epoch = this.epoch
    this.update({ busy: true, error: "" })
    try {
      if (!this.media?.getUserMedia) {
        throw new Error("Microphone access is unavailable in this browser.")
      }
      const stream = await this.media.getUserMedia({
        video: false,
        audio: true,
      })
      stream.getTracks().forEach((track) => track.stop())
      if (this.active && epoch === this.epoch) {
        await this.refresh()
      }
    } catch {
      if (epoch === this.epoch) {
        this.update({
          error:
            "Allow microphone access to list your microphones and speakers, then try again.",
        })
      }
    } finally {
      if (epoch === this.epoch) {
        this.update({ busy: false })
      }
    }
  }
  private save(selection: AudioDeviceSelection): void {
    this.update({ selection })
    try {
      this.storage?.setItem(KEY, JSON.stringify(selection))
    } catch {
      /* Selection remains usable without storage. */
    }
  }
  setMicrophone(microphoneId: string): void {
    this.save({ ...this.snapshot.selection, microphoneId })
    this.update({ inputMissing: false, error: "" })
  }
  async setOutput(
    outputId: string,
    apply: (id: string) => Promise<void>
  ): Promise<void> {
    const epoch = this.epoch
    const request = ++this.outputId
    this.update({ busy: true, error: "" })
    try {
      await apply(outputId)
      if (!this.active || epoch !== this.epoch || request !== this.outputId) {
        return
      }
      this.save({ ...this.snapshot.selection, outputId })
      this.update({ outputMissing: false })
    } catch (error) {
      if (epoch === this.epoch && request === this.outputId) {
        this.update({
          error:
            error instanceof Error
              ? error.message
              : "Audio output could not be changed.",
        })
      }
    } finally {
      if (epoch === this.epoch && request === this.outputId) {
        this.update({ busy: false })
      }
    }
  }
  dispose(): void {
    this.active = false
    this.epoch++
    this.media?.removeEventListener("devicechange", this.devicesChanged)
  }
}
