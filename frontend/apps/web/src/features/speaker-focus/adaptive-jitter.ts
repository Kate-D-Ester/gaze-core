import type { Arrival } from "./adaptive-jitter.types"
export class AdaptiveJitter {
  private deviations: number[] = []
  private previous: Arrival | null = null
  private readonly initial: number
  reserve: number
  readonly quantum: number
  constructor(rate: number, baseLatency = 0, warm: number[] = []) {
    this.quantum = 128 / rate
    const sorted = warm.filter(Number.isFinite).sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0
    const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
    this.initial = Math.max(this.quantum * 2, baseLatency, p95 - median)
    this.reserve = this.initial
  }
  arrive(time: number, duration: number): void {
    if (this.previous) {
      this.deviations.push(
        Math.max(0, time - this.previous.time - this.previous.duration)
      )
      this.deviations = this.deviations.slice(-32)
      this.reconsider()
    }
    this.previous = { time, duration }
  }
  private reconsider(): void {
    const values = [...this.deviations].sort((a, b) => a - b)
    const p95 = values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0
    this.reserve = Math.max(this.initial, p95 + this.quantum)
  }
  underrun(late: number): void {
    this.reserve = Math.max(this.reserve, late + this.quantum)
  }
  reset(): void {
    this.previous = null
    this.reconsider()
  }
}
