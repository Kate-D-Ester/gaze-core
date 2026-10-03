import type {
  LocalRecognition,
  LocalRecognitionConstructor,
  LocalVoiceSnapshot,
  SpeechWindow,
} from "./local-voice.types"

function browserRecognition(): LocalRecognitionConstructor | undefined {
  if (typeof window === "undefined") {
    return undefined
  }
  const browser = window as SpeechWindow
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition
}

export class LocalVoiceController {
  private snapshot: LocalVoiceSnapshot = {
    status: "idle",
    message: "Voice is off. Type a command or enable local voice.",
    canInstall: false,
  }
  private listeners = new Set<() => void>()
  private recognition: LocalRecognition | null = null
  private generation = 0
  private disposed = false
  constructor(private readonly factory = browserRecognition) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(next: LocalVoiceSnapshot) {
    this.snapshot = next
    this.listeners.forEach((listener) => listener())
  }
  mount() {
    this.disposed = false
  }
  stop() {
    this.generation++
    const recognition = this.recognition
    this.recognition = null
    if (recognition) {
      recognition.onstart = null
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.abort()
      } catch {
        /* Already stopped by the browser. */
      }
    }
    this.update({
      status: "idle",
      message: "Voice is off. Typed commands are available.",
      canInstall: false,
    })
  }
  dispose() {
    this.stop()
    this.disposed = true
  }
  async start(handler: (text: string) => void) {
    if (
      this.disposed ||
      ["checking", "starting", "listening", "downloading"].includes(
        this.snapshot.status
      )
    ) {
      return
    }
    this.stop()
    const generation = this.generation
    this.update({
      status: "checking",
      message: "Checking on-device speech support…",
      canInstall: false,
    })
    try {
      const Constructor = this.factory()
      const recognition = Constructor ? new Constructor() : null
      if (
        !Constructor?.available ||
        !recognition ||
        !("processLocally" in recognition)
      ) {
        this.update({
          status: "unavailable",
          message:
            "Local voice is unavailable in this browser. Use typed commands or a browser with on-device speech support.",
          canInstall: false,
        })
        return
      }
      const availability = await Constructor.available({
        langs: ["en-US"],
        processLocally: true,
      })
      if (this.disposed || generation !== this.generation) {
        return
      }
      if (availability !== "available") {
        this.update({
          status: "unavailable",
          message:
            "The local English speech pack is not ready. Typed commands remain available.",
          canInstall: availability === "downloadable" && !!Constructor.install,
        })
        return
      }
      recognition.processLocally = true
      recognition.lang = "en-US"
      recognition.continuous = true
      recognition.interimResults = false
      const handled = new Set<number>()
      recognition.onresult = (event) => {
        for (
          let index = event.resultIndex;
          index < event.results.length;
          index++
        ) {
          if (generation !== this.generation || this.disposed) {
            return
          }
          const result = event.results[index]
          if (result?.isFinal && !handled.has(index) && result[0]?.transcript) {
            handled.add(index)
            handler(result[0].transcript)
          }
        }
      }
      recognition.onstart = () => {
        if (generation === this.generation && !this.disposed) {
          this.update({
            status: "listening",
            message: "Listening on this device · English commands",
            canInstall: false,
          })
        }
      }
      recognition.onerror = (event) => {
        if (generation !== this.generation) {
          return
        }
        this.stop()
        const denied =
          event.error === "not-allowed" || event.error === "service-not-allowed"
        this.update({
          status: "error",
          message: denied
            ? "Microphone access was denied. Typed commands remain available."
            : "Local voice stopped. Enable voice to retry, or type a command.",
          canInstall: false,
        })
      }
      recognition.onend = () => {
        if (generation === this.generation) {
          this.stop()
        }
      }
      this.recognition = recognition
      this.update({
        status: "starting",
        message: "Starting the local microphone…",
        canInstall: false,
      })
      recognition.start()
    } catch {
      if (generation === this.generation && !this.disposed) {
        this.stop()
        this.update({
          status: "error",
          message:
            "Local voice could not start. Check browser permissions or type a command.",
          canInstall: false,
        })
      }
    }
  }
  async install() {
    if (this.disposed || !this.snapshot.canInstall) {
      return
    }
    this.stop()
    const generation = this.generation
    this.update({
      status: "downloading",
      message:
        "Downloading the local English speech pack. No microphone audio is sent.",
      canInstall: false,
    })
    try {
      const installed = await this.factory()?.install?.({ langs: ["en-US"] })
      if (generation !== this.generation || this.disposed) {
        return
      }
      this.update({
        status: installed ? "idle" : "error",
        message: installed
          ? "Speech pack installed. Enable local voice to begin."
          : "Speech pack download failed. Use typed commands or retry voice setup.",
        canInstall: false,
      })
    } catch {
      if (generation === this.generation && !this.disposed) {
        this.update({
          status: "error",
          message:
            "Speech pack download failed. Typed commands remain available.",
          canInstall: false,
        })
      }
    }
  }
}
