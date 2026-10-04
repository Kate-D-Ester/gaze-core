import type { RoutableAudioContext } from "./audio-devices.types"
export function supportsAudioOutputSelection(): boolean {
  return (
    typeof AudioContext !== "undefined" &&
    typeof (AudioContext.prototype as RoutableAudioContext).setSinkId ===
      "function"
  )
}
export async function routeAudioOutput(
  context: AudioContext,
  deviceId: string
): Promise<void> {
  const routable = context as RoutableAudioContext
  if (!routable.setSinkId) {
    if (!deviceId) {
      return
    }
    throw new Error(
      "This browser cannot choose a speaker. Use system sound settings or a browser with audio output selection."
    )
  }
  try {
    await routable.setSinkId(deviceId)
  } catch {
    throw new Error(
      "The selected speaker / headphones are unavailable or blocked. Allow audio device access and select an available output."
    )
  }
}
