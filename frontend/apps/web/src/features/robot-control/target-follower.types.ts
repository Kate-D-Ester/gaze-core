export type FollowSnapshot = {
  enabled: boolean
  phase: "off" | "waiting" | "moving" | "holding" | "error"
  command: string
  error: string
}
