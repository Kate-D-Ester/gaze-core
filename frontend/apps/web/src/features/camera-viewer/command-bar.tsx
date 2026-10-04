import { Camera, Mic, MicOff } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { EyeButtonStyles, EyeFieldStyles } from "../tracking-ui/control-styles"
import type { CommandBarProps } from "./command-bar.types"

export function CommandBar({
  activeLabel,
  canCapture,
  capturing,
  voice,
  feedback,
  commandError,
  onCommand,
  onVoiceStart,
  onVoiceStop,
}: CommandBarProps) {
  const container = useRef<HTMLElement>(null)
  const [command, setCommand] = useState("")
  useEffect(() => {
    const element = container.current
    const scrollArea = element?.closest("main")
    if (!element || !scrollArea) {
      return
    }
    const measure = () =>
      scrollArea.style.setProperty(
        "--viewer-command-height",
        element.getBoundingClientRect().height + "px"
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
      scrollArea.style.removeProperty("--viewer-command-height")
    }
  }, [])
  const voiceActive =
    voice.status === "starting" || voice.status === "listening"
  const voiceLabel = {
    idle: "Voice off",
    starting: "Starting…",
    listening: "Listening",
    error: "Retry voice",
  }[voice.status]
  return (
    <section
      ref={container}
      aria-labelledby="viewer-command-title"
      className="sticky top-0 z-30 max-h-[calc(100svh-5.25rem)] overflow-y-auto rounded-lg border bg-card p-3"
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
            <Mic size={15} aria-hidden="true" />
          ) : (
            <MicOff size={15} aria-hidden="true" />
          )}
          {voiceLabel}
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
            {text === "select" ? "Confirm point" : text}
          </button>
        ))}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer rounded px-2 py-2">
            Commands &amp; voice help
          </summary>
          <div className="mt-2 max-h-24 space-y-2 overflow-y-auto pb-1">
            <p>
              Click a preview to mark a point. Select confirms it; clear removes
              it. Enter or Space on a preview marks its center. The gaze dot is
              a live preview. Each camera has its own manual markers.
            </p>
            <p>
              Commands: eye camera, scene camera, auxiliary camera, select,
              clear, switch camera, take photo, stop cameras, stop voice.
            </p>
            <p>
              Tap Voice off and allow the microphone. Wait for Listening, say
              one English command, then pause. Heard confirms recognition. Audio
              stays on this device.
            </p>
          </div>
        </details>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-relaxed text-muted-foreground">
        <p
          role={commandError ? "alert" : "status"}
          aria-live="polite"
          className={commandError ? "text-red-200" : undefined}
        >
          {feedback || "Click a preview to mark a point."}
        </p>
        {voice.status !== "idle" && (
          <p
            role={voice.status === "error" ? "alert" : "status"}
            aria-label="Voice feedback"
            aria-live="polite"
          >
            {voice.message}
          </p>
        )}
      </div>
    </section>
  )
}
