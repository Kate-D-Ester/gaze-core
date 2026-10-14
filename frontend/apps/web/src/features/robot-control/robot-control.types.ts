import type { IClientOptions, MqttClient } from "mqtt"
export type BotConfiguration = {
  mqttUrl: string
  commandTopic: string
  mqttUsername: string
  mqttPassword: string
}
export type FollowSettings = { speed: number }
export type Movement = {
  action: "car"
  cmd: "L" | "R"
  speed: number
}
export type CarCommand = {
  cmd: Movement["cmd"] | "S"
  speed: number
  timestamp: number
  id: number
}
export type RobotSnapshot = {
  connected: boolean
  connecting: boolean
  canControl: boolean
  authority: string
  error: string
}
export type MotionSession = {
  getSnapshot: () => RobotSnapshot
  move: (
    action: Movement["action"],
    cmd: Movement["cmd"],
    speed: number,
    guard: () => boolean
  ) => Promise<void>
  cancelMotion: () => void
  stop: () => Promise<void>
}
export type MqttTransport = Pick<MqttClient, "on" | "publish" | "end">
export type SessionDependencies = {
  connect?: (url: string, options: IClientOptions) => MqttTransport
  now?: () => number
}
