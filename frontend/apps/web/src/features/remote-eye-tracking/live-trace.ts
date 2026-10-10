import type { RemoteLiveTraceEntry } from "./live-trace.types"

const WINDOW_MS = 20000
const MIN_INTERVAL_MS = 100
const MAX_READINGS = 200

/** Bounded in-memory diagnostics, downloaded only through Results export. */
export class RemoteLiveTrace {
  private entries: RemoteLiveTraceEntry[] = []

  record(entry: RemoteLiveTraceEntry): void {
    const timestamp = entry.observation.timestamp
    if (!Number.isFinite(timestamp)) {
      return
    }
    const previous = this.entries.at(-1)?.observation.timestamp
    if (previous !== undefined && timestamp - previous < MIN_INTERVAL_MS) {
      return
    }
    this.entries = this.read(timestamp)
    this.entries.push(entry)
    if (this.entries.length > MAX_READINGS) {
      this.entries.shift()
    }
  }

  read(now = performance.now()): RemoteLiveTraceEntry[] {
    if (!Number.isFinite(now)) {
      return []
    }
    return this.entries.filter((entry) => {
      const age = now - entry.observation.timestamp
      return age >= 0 && age <= WINDOW_MS
    })
  }
}
