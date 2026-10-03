import type { ViewerCommand } from "./commands.types"

const COMMANDS: Readonly<Record<string, ViewerCommand>> = {
  select: { kind: "select" },
  "select it": { kind: "select" },
  clear: { kind: "clear" },
  "clear selection": { kind: "clear" },
  "take photo": { kind: "photo" },
  "take a photo": { kind: "photo" },
  "switch camera": { kind: "next-camera" },
  "eye camera": { kind: "camera", role: "eye" },
  "scene camera": { kind: "camera", role: "scene" },
  "auxiliary camera": { kind: "camera", role: "auxiliary" },
  "stop cameras": { kind: "stop" },
  "stop all cameras": { kind: "stop" },
  "stop voice": { kind: "voice-stop" },
}

export function parseViewerCommand(text: string): ViewerCommand | null {
  const phrase = text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, "")
    .replace(/\s+/g, " ")
  return Object.hasOwn(COMMANDS, phrase) ? COMMANDS[phrase]! : null
}
