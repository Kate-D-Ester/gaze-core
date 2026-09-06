import type { GyroSnapshot } from "./types"

export function buildZeroGyroSnapshot(timestamp = Date.now()): GyroSnapshot {
  return {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    timestamp,
  }
}

export function resolveGyroZeroSnapshot(snapshot: GyroSnapshot | null | undefined): GyroSnapshot {
  return snapshot ?? buildZeroGyroSnapshot()
}
