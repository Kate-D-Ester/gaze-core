import { Camera, Mic, MicOff } from "lucide-react"
import { useState } from "react"
import { EyeButtonStyles, EyeFieldStyles } from "../tracking-ui/control-styles"
import type { CommandBarProps } from "./command-bar.types"

export function CommandBar({
  activeLabel,
  canCapture,
  capturing,
  voice,
  onCommand,
  onVoiceStart,
  onVoiceStop,
  onVoiceInstall,
}: CommandBarProps) {
  const [command, setCommand] = useState("")
  const voiceActive = [
    "checking",
    "starting",
    "listening",
    "downloading",
  ].includes(voice.status)
  return (
    <section
      aria-labelledby="viewer-command-title"
      className="rounded-lg border bg-card p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2
          id="viewer-command-title"
          className="scroll-mt-4 text-sm font-semibold"
        >
          Commands · {activeLabel}
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-label="Take photo"
            disabled={!canCapture || capturing}
            className={`secondary ${EyeButtonStyles}`}
            onClick={() => onCommand("take photo")}
          >
            <Camera size={15} aria-hidden="true" />
            {capturing ? "Saving…" : "Take photo"}
          </button>
          <button
            type="button"
            className={`secondary ${EyeButtonStyles}`}
            onClick={voiceActive ? onVoiceStop : onVoiceStart}
          >
            {voiceActive ? (
              <MicOff size={15} aria-hidden="true" />
            ) : (
              <Mic size={15} aria-hidden="true" />
            )}
            {voiceActive ? "Stop voice" : "Enable local voice"}
          </button>
        </div>
      </div>
      <form
        aria-label="Camera commands"
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          onCommand(command)
          setCommand("")
        }}
      >
        <label className={`${EyeFieldStyles} m-0! min-w-0 flex-1`}>
          Type a command
          <input
            aria-label="Viewer command"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="select · clear · switch camera · take photo"
            autoComplete="off"
            maxLength={120}
          />
        </label>
        <button
          type="submit"
          className={`primary ${EyeButtonStyles}`}
          disabled={!command.trim()}
        >
          Run command
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {["select", "clear", "switch camera", "stop cameras"].map((text) => (
          <button
            key={text}
            type="button"
            className={`secondary ${EyeButtonStyles}`}
            onClick={() => onCommand(text)}
          >
            {text === "select" ? "Select point" : text}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        “select” keeps your marked point, or uses the center if none is marked.
        “switch camera” cycles Eye → Scene → Auxiliary. Type a camera name to
        choose it directly. “clear” removes its point.
      </p>
      <div className="mt-4 border-t pt-3">
        <h3 className="text-xs font-medium">Optional English voice commands</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Offline voice keeps microphone audio on your device. Your browser may
          need to download its English voice model once; this is only for voice.
          It is not required for camera setup, buttons or typing. Some browsers
          cannot install or run offline voice.
        </p>
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-xs leading-relaxed text-muted-foreground"
        >
          {voice.message}
        </p>
        {voice.canInstall && (
          <button
            type="button"
            className={`secondary mt-2 ${EyeButtonStyles}`}
            onClick={onVoiceInstall}
          >
            {voice.status === "error"
              ? "Retry voice download"
              : "Download English voice model"}
          </button>
        )}
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          After enabling voice, say a complete command: “eye camera,” “scene
          camera,” “auxiliary camera,” “select,” “clear,” “switch camera,” “take
          photo,” “stop cameras,” or “stop voice.”
        </p>
      </div>
    </section>
  )
}
