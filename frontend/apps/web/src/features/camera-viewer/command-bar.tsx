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
      className="rounded-lg border bg-card p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2
          id="viewer-command-title"
          className="min-w-0 flex-1 scroll-mt-4 text-xs font-semibold md:flex-none"
        >
          {activeLabel}
        </h2>
        <form
          aria-label="Camera commands"
          className="order-last flex min-w-0 basis-full items-center gap-2 md:order-none md:min-w-52 md:flex-1 md:basis-auto"
          onSubmit={(event) => {
            event.preventDefault()
            onCommand(command)
            setCommand("")
          }}
        >
          <label className={`${EyeFieldStyles} m-0! min-w-0 flex-1`}>
            <span className="sr-only">Type a command</span>
            <input
              aria-label="Viewer command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="Type a command…"
              autoComplete="off"
              maxLength={120}
            />
          </label>
          <button
            type="submit"
            className={`primary ${EyeButtonStyles}`}
            disabled={!command.trim()}
          >
            Run
          </button>
        </form>
        <button
          type="button"
          aria-label="Take photo"
          disabled={!canCapture || capturing}
          className={`secondary ${EyeButtonStyles}`}
          onClick={() => onCommand("take photo")}
        >
          <Camera size={15} aria-hidden="true" />
          {capturing ? "Saving…" : "Photo"}
        </button>
        <button
          type="button"
          aria-label={voiceActive ? "Stop voice" : "Enable local voice"}
          aria-pressed={voiceActive}
          className={`secondary ${EyeButtonStyles}`}
          onClick={voiceActive ? onVoiceStop : onVoiceStart}
        >
          {voiceActive ? (
            <MicOff size={15} aria-hidden="true" />
          ) : (
            <Mic size={15} aria-hidden="true" />
          )}
          {voiceActive ? "Stop voice" : "Voice"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
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
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer rounded px-2 py-2">
            Commands &amp; voice help
          </summary>
          <div className="mt-2 space-y-2 pb-1">
            <p>
              Select keeps your point, or uses the center. Clear removes it.
            </p>
            <p>
              Commands: eye camera, scene camera, auxiliary camera, select,
              clear, switch camera, take photo, stop cameras, stop voice.
            </p>
            <p>
              Optional offline English voice may need a one-time model download.
              Audio stays on this device.
            </p>
          </div>
        </details>
      </div>
      {voice.status !== "idle" && (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-xs leading-relaxed text-muted-foreground"
        >
          {voice.message}
        </p>
      )}
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
    </section>
  )
}
