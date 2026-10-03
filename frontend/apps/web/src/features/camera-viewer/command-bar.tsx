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
        <h2 id="viewer-command-title" className="text-sm font-semibold">
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
          {voice.canInstall && (
            <button
              type="button"
              className={`secondary ${EyeButtonStyles}`}
              onClick={onVoiceInstall}
            >
              Download speech pack
            </button>
          )}
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
            {text}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {voice.message}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Also say “eye camera,” “scene camera,” “auxiliary camera,” or “stop
        voice.” Click a preview to pin a static point; “select” uses its center
        if no point is chosen.
      </p>
    </section>
  )
}
