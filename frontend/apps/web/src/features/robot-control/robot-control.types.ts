import type { IClientOptions, MqttClient } from "mqtt"
export type BotConfiguration = {
  mqttUrl: string
  topicPrefix: string
  mqttUsername: string
  mqttPassword: string
}
export type FollowSettings = { desiredWidth: number; speed: number }
export type Movement = {
  action: "car"
  cmd: "F" | "B" | "L" | "R"
  speed: number
}
export type RobotState = {
  status: "online"
  boot: string
  epoch: number
  current: string
  master: boolean
  queue_mode: "automatic" | "manual"
  queue: { name: string; session: string }[]
}
export type RobotSnapshot = {
  connected: boolean
  connecting: boolean
  online: boolean
  canControl: boolean
  joined: boolean
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
export type MqttTransport = Pick<
  MqttClient,
  "on" | "subscribe" | "publish" | "end"
>
export type SessionDependencies = {
  connect?: (url: string, options: IClientOptions) => MqttTransport
  now?: () => number
}
