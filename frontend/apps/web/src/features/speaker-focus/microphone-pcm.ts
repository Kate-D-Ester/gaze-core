/** Attenuate over-range PCM uniformly; keep ordinary levels and reject invalid data. */
export function normalizeMicrophonePcm(pcm: Float32Array): void {
  let peak = 1
  if (!pcm.length || !pcm.every(Number.isFinite)) {
    throw new Error(
      "The microphone returned invalid audio. Reconnect it or choose another microphone."
    )
  }
  for (const value of pcm) {
    peak = Math.max(peak, Math.abs(value))
  }
  if (peak > 1) {
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = pcm[i]! / peak
    }
  }
}
