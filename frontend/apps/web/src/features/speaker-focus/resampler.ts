/** Streaming low-pass FIR followed by fractional-rate interpolation. */
export class PcmResampler {
  private held = new Float32Array(0)
  private position = 0
  private history = new Float32Array(63)
  private coefficients = new Float32Array(63)
  private cursor = 0
  private initialized = false
  constructor(private readonly rate: number) {
    if (!Number.isFinite(rate) || rate < 16000 || rate > 192000) {
      throw new Error("Unsupported sample rate")
    }
    const cutoff = 7500 / rate
    let total = 0
    for (let i = 0; i < 63; i++) {
      const distance = i - 31
      const sinc =
        distance === 0
          ? 2 * cutoff
          : Math.sin(2 * Math.PI * cutoff * distance) / (Math.PI * distance)
      const value = sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / 62))
      this.coefficients[i] = value
      total += value
    }
    for (let i = 0; i < 63; i++) {
      this.coefficients[i]! /= total
    }
  }
  push(input: Float32Array, rate = this.rate): Float32Array {
    if (rate !== this.rate) {
      throw new Error("Audio sample rate changed; restart capture")
    }
    if (!input.every(Number.isFinite)) {
      throw new Error("Invalid microphone samples")
    }
    if (this.rate === 16000) {
      return input.slice()
    }
    const filtered = new Float32Array(input.length)
    if (!this.initialized && input.length) {
      this.history.fill(input[0]!)
      this.initialized = true
    }
    for (let i = 0; i < input.length; i++) {
      this.history[this.cursor] = input[i]!
      let value = 0
      for (let j = 0; j < 63; j++) {
        value +=
          this.history[(this.cursor - j + 63) % 63]! * this.coefficients[j]!
      }
      filtered[i] = value
      this.cursor = (this.cursor + 1) % 63
    }
    const joined = new Float32Array(this.held.length + filtered.length)
    joined.set(this.held)
    joined.set(filtered, this.held.length)
    const output: number[] = []
    while (this.position < joined.length) {
      const index = Math.floor(this.position)
      const fraction = this.position - index
      if (fraction > 1e-8 && index + 1 >= joined.length) {
        break
      }
      output.push(
        joined[index]! * (1 - fraction) +
          joined[Math.min(index + 1, joined.length - 1)]! * fraction
      )
      this.position += this.rate / 16000
    }
    const consumed = Math.min(Math.floor(this.position), joined.length)
    this.held = joined.slice(consumed)
    this.position -= consumed
    return Float32Array.from(output)
  }
}
