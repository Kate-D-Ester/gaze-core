import mqtt from "mqtt"
import type {
  BotConfiguration,
  CarCommand,
  Movement,
  MqttTransport,
  RobotSnapshot,
  SessionDependencies,
} from "./robot-control.types"

import { validateBotConfiguration } from "./bot-configuration"
export { validateBotConfiguration } from "./bot-configuration"

const empty = (): RobotSnapshot => ({
  connected: false,
  connecting: false,
  canControl: false,
  authority: "",
  error: "",
})

/** Direct adapter for Zero's existing F/B/L/R/S car command format. */
export class ZeroSession {
  private snapshot = empty()
  private listeners = new Set<() => void>()
  private client: MqttTransport | null = null
  private configuration: BotConfiguration | null = null
  private connected = false
  private closing = false
  private connectionVersion = 0
  private transportVersion = 0
  private motionVersion = 0
  private commandId = 0
  private chain: Promise<unknown> = Promise.resolve()
  private readonly now: () => number
  constructor(private readonly dependencies: SessionDependencies = {}) {
    this.now = dependencies.now ?? Date.now
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private refresh(error = this.snapshot.error) {
    this.snapshot = {
      connected: this.connected,
      connecting:
        !this.closing &&
        !this.connected &&
        (!!this.client || this.snapshot.connecting),
      canControl: this.connected && !this.closing && !error,
      authority: `${this.connectionVersion}:${this.transportVersion}:${this.connected}`,
      error,
    }
    this.listeners.forEach((fn) => fn())
  }
  async connect(configuration: BotConfiguration) {
    const config = validateBotConfiguration(configuration)
    const version = ++this.connectionVersion
    await this.closeConnection()
    if (version !== this.connectionVersion) {
      return
    }
    this.configuration = config
    this.closing = false
    this.commandId = 0
    this.chain = Promise.resolve()
    this.snapshot = { ...empty(), connecting: true }
    this.listeners.forEach((fn) => fn())
    try {
      const client = (this.dependencies.connect ?? mqtt.connect)(
        config.mqttUrl,
        {
          username: config.mqttUsername,
          password: config.mqttPassword,
          clientId: `GazeBot_${crypto.randomUUID()}`,
          clean: true,
          reconnectPeriod: 2000,
          connectTimeout: 10000,
          keepalive: 5,
          queueQoSZero: false,
          will: {
            topic: config.commandTopic,
            payload: JSON.stringify({
              cmd: "S",
              speed: 0,
              timestamp: this.now(),
              id: 0,
            }),
            qos: 0,
            retain: false,
          },
        }
      )
      this.client = client
      const current = () =>
        this.client === client &&
        this.connectionVersion === version &&
        !this.closing
      client.on("connect", () => {
        if (!current()) {
          return
        }
        this.cancelMotion()
        this.transportVersion++
        this.connected = true
        this.refresh("")
      })
      for (const event of ["offline", "close"] as const) {
        client.on(event, () => {
          if (!current()) {
            return
          }
          this.cancelMotion()
          this.connected = false
          this.transportVersion++
          this.refresh()
        })
      }
      client.on("error", () => {
        if (!current()) {
          return
        }
        this.cancelMotion()
        this.refresh(
          "Bot MQTT connection failed. Check the endpoint and credentials."
        )
      })
    } catch {
      this.connected = false
      this.snapshot = {
        ...empty(),
        error:
          "Bot MQTT connection failed. Check the endpoint and credentials.",
      }
      this.listeners.forEach((fn) => fn())
      throw new Error(this.snapshot.error)
    }
  }
  private publication(
    client: MqttTransport,
    topic: string,
    packet: CarCommand
  ) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Bot command publication timed out.")),
        300
      )
      try {
        client.publish(
          topic,
          JSON.stringify(packet),
          { qos: 0, retain: false },
          (error) => {
            clearTimeout(timer)
            if (error) {
              reject(new Error("Bot MQTT publication failed."))
            } else {
              resolve()
            }
          }
        )
      } catch {
        clearTimeout(timer)
        reject(new Error("Bot MQTT publication failed."))
      }
    })
  }
  private send(
    cmd: CarCommand["cmd"],
    speed: number,
    guard: () => boolean = () => true
  ): Promise<void> {
    const client = this.client
    const topic = this.configuration?.commandTopic
    const motionVersion = this.motionVersion
    const transportVersion = this.transportVersion
    const connectionVersion = this.connectionVersion
    const operation = async () => {
      if (
        !client ||
        !topic ||
        !this.connected ||
        this.client !== client ||
        transportVersion !== this.transportVersion ||
        connectionVersion !== this.connectionVersion ||
        (cmd !== "S" &&
          (this.closing ||
            !!this.snapshot.error ||
            motionVersion !== this.motionVersion ||
            !guard()))
      ) {
        throw new Error("Bot movement cancelled or MQTT connection changed.")
      }
      try {
        await this.publication(client, topic, {
          cmd,
          speed,
          timestamp: this.now(),
          id: ++this.commandId,
        })
      } catch (error) {
        if (
          this.client === client &&
          connectionVersion === this.connectionVersion
        ) {
          this.cancelMotion()
          this.refresh(
            error instanceof Error
              ? error.message
              : "Bot MQTT publication failed."
          )
        }
        throw error
      }
    }
    const result = this.chain.then(operation)
    this.chain = result.catch(() => {})
    return result
  }
  move(
    action: Movement["action"],
    cmd: Movement["cmd"],
    speed: number,
    guard: () => boolean
  ) {
    if (
      action !== "car" ||
      !["L", "R"].includes(cmd) ||
      !Number.isInteger(speed) ||
      speed < 1 ||
      speed > 100
    ) {
      return Promise.reject(new Error("Invalid bot movement."))
    }
    return this.send(cmd, speed, guard)
  }
  cancelMotion() {
    this.motionVersion++
  }
  stop() {
    this.cancelMotion()
    return this.connected
      ? this.send("S", 0).catch(() => {})
      : Promise.resolve()
  }
  disconnect() {
    this.connectionVersion++
    return this.closeConnection()
  }
  private async closeConnection() {
    this.closing = true
    const client = this.client
    const stopping = this.stop()
    this.refresh()
    await stopping
    if (this.client === client) {
      this.client = null
      this.configuration = null
      this.connected = false
      this.snapshot = empty()
      this.listeners.forEach((fn) => fn())
    }
    client?.end(true)
  }
}
