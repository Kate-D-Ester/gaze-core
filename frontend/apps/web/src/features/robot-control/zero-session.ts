import type { GuestIdentity } from "./zero-protocol.types"
import type { PendingReply } from "./zero-session.types"
import mqtt from "mqtt"
import { createGuestIdentity, signMessage } from "./zero-protocol"
import type {
  BotConfiguration,
  Movement,
  MqttTransport,
  RobotSnapshot,
  RobotState,
  SessionDependencies,
} from "./robot-control.types"

export function validateBotConfiguration(
  input: BotConfiguration
): BotConfiguration {
  const url = new URL(input.mqttUrl.trim())
  if (
    !["ws:", "wss:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Use the bot broker's ws:// or wss:// MQTT endpoint without embedded credentials."
    )
  }
  const prefix = input.topicPrefix.trim().replace(/\/+$/, "")
  if (
    !prefix ||
    prefix.length > 128 ||
    /[+#\s]/.test(prefix) ||
    prefix.includes("\u0000") ||
    prefix.startsWith("/")
  ) {
    throw new Error(
      "Enter the controller's MQTT topic prefix without wildcards."
    )
  }
  if (input.mqttUsername.length > 256 || input.mqttPassword.length > 256) {
    throw new Error("Broker credentials are too long.")
  }
  return { ...input, mqttUrl: url.href, topicPrefix: prefix }
}
function validState(value: unknown): value is RobotState {
  if (!value || typeof value !== "object") {
    return false
  }
  const state = value as RobotState
  return (
    state.status === "online" &&
    /^[0-9a-f]{32}$/.test(state.boot) &&
    Number.isInteger(state.epoch) &&
    state.epoch > 0 &&
    typeof state.current === "string" &&
    typeof state.master === "boolean" &&
    ["automatic", "manual"].includes(state.queue_mode) &&
    Array.isArray(state.queue) &&
    state.queue.length <= 16 &&
    state.queue.every(
      (user) =>
        user &&
        typeof user.name === "string" &&
        user.name.length <= 24 &&
        /^[0-9a-f]{32}$/.test(user.session)
    )
  )
}
const empty = (): RobotSnapshot => ({
  connected: false,
  connecting: false,
  online: false,
  canControl: false,
  joined: false,
  authority: "",
  error: "",
})

/** Guest-only adapter for Zero's signed, epoch-bound controller protocol. */
export class ZeroSession {
  private snapshot = empty()
  private listeners = new Set<() => void>()
  private client: MqttTransport | null = null
  private identity: GuestIdentity | null = null
  private configuration: BotConfiguration | null = null
  private state: RobotState | null = null
  private connected = false
  private closing = false
  private lastSeen = -Infinity
  private lastHeartbeat = -Infinity
  private seq = 0
  private connectionVersion = 0
  private motionVersion = 0
  private chain: Promise<unknown> = Promise.resolve()
  private pending = new Map<number | "challenge", PendingReply>()
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly now: () => number
  constructor(private readonly dependencies: SessionDependencies = {}) {
    this.now = dependencies.now ?? Date.now
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private get online() {
    return (
      this.connected &&
      !!this.state &&
      this.now() - this.lastSeen >= 0 &&
      this.now() - this.lastSeen < 5000
    )
  }
  private get authorized() {
    return (
      this.online &&
      this.state!.current === this.identity?.session &&
      !this.state!.master
    )
  }
  private refresh(error = this.snapshot.error) {
    const joined = !!this.state?.queue.some(
      (user) => user.session === this.identity?.session
    )
    this.snapshot = {
      connected: this.connected,
      connecting: this.snapshot.connecting && !this.connected,
      online: this.online,
      canControl: this.authorized && !this.closing && !error,
      joined,
      authority: `${this.state?.boot ?? ""}:${this.state?.epoch ?? ""}:${this.state?.current ?? ""}:${this.online}:${this.state?.master ?? false}`,
      error,
    }
    this.listeners.forEach((fn) => fn())
  }
  async connect(configuration: BotConfiguration) {
    const config = validateBotConfiguration(configuration)
    await this.disconnect()
    const version = ++this.connectionVersion
    this.snapshot = { ...empty(), connecting: true }
    this.listeners.forEach((fn) => fn())
    try {
      const identity = await createGuestIdentity()
      if (version !== this.connectionVersion) {
        return
      }
      this.identity = identity
      this.configuration = config
      this.seq = 0
      this.closing = false
      this.chain = Promise.resolve()
      const client = (this.dependencies.connect ?? mqtt.connect)(
        config.mqttUrl,
        {
          username: config.mqttUsername,
          password: config.mqttPassword,
          clientId: `GazeBot_${identity.session}`,
          clean: true,
          reconnectPeriod: 2000,
          connectTimeout: 10000,
          keepalive: 20,
          queueQoSZero: false,
        }
      )
      this.client = client
      const current = () =>
        this.client === client &&
        this.identity === identity &&
        version === this.connectionVersion
      client.on("connect", () => {
        if (!current()) {
          return
        }
        this.connected = true
        this.lastSeen = -Infinity
        this.state = null
        client.subscribe(
          [
            `${config.topicPrefix}/state`,
            `${config.topicPrefix}/reply/${identity.session}`,
          ],
          { qos: 0 },
          (error) => {
            if (current() && error) {
              this.refresh("Bot MQTT subscription failed.")
            }
          }
        )
        this.refresh("")
      })
      client.on("message", (topic, bytes, packet) => {
        if (!current() || bytes.length > 8000 || packet.retain) {
          return
        }
        let message: Record<string, unknown>
        try {
          message = JSON.parse(new TextDecoder().decode(bytes))
        } catch {
          return
        }
        if (!message || typeof message !== "object" || Array.isArray(message)) {
          return
        }
        if (topic === `${config.topicPrefix}/state`) {
          if (message.status === "offline") {
            this.lastSeen = -Infinity
            this.cancelMotion()
            this.refresh()
            return
          }
          if (!validState(message)) {
            return
          }
          const changed =
            this.state &&
            (this.state.boot !== message.boot ||
              this.state.epoch !== message.epoch ||
              this.state.current !== message.current ||
              this.state.master !== message.master)
          if (changed) {
            this.cancelMotion()
          }
          if (this.state && this.state.boot !== message.boot) {
            this.rejectPending("Bot rebooted. Retry access.")
          }
          this.state = message
          this.lastSeen = this.now()
          this.refresh()
        } else if (
          topic === `${config.topicPrefix}/reply/${identity.session}` &&
          message.session === identity.session
        ) {
          const challenge =
            typeof message.challenge === "string" &&
            /^[0-9a-f]{32}$/.test(message.challenge) &&
            message.boot === this.state?.boot
          const key = challenge ? "challenge" : message.seq
          if (typeof key !== "number" && key !== "challenge") {
            return
          }
          const pending = this.pending.get(key)
          if (!pending) {
            if (
              message.ok === false &&
              typeof message.seq === "number" &&
              Number.isInteger(message.seq) &&
              message.seq > 0 &&
              message.seq <= this.seq
            ) {
              this.cancelMotion()
              this.refresh(
                typeof message.error === "string"
                  ? message.error.slice(0, 160)
                  : "Bot rejected movement."
              )
            }
            return
          }
          clearTimeout(pending.timer)
          this.pending.delete(key)
          if (message.ok === true) {
            pending.resolve(message)
          } else {
            pending.reject(
              new Error(
                typeof message.error === "string"
                  ? message.error.slice(0, 160)
                  : "Bot rejected the request."
              )
            )
          }
        }
      })
      for (const event of ["offline", "close"] as const) {
        client.on(event, () => {
          if (!current()) {
            return
          }
          this.connected = false
          this.lastSeen = -Infinity
          this.cancelMotion()
          this.rejectPending("Bot MQTT connection lost.")
          this.refresh()
        })
      }
      client.on("error", () => {
        if (current()) {
          this.refresh(
            "Bot MQTT connection failed. Check the endpoint and credentials."
          )
        }
      })
      this.timer = setInterval(() => {
        this.refresh()
        if (
          this.online &&
          !this.closing &&
          this.snapshot.joined &&
          this.now() - this.lastHeartbeat >= 2000
        ) {
          this.lastHeartbeat = this.now()
          void this.send("heartbeat", {}).catch(() => {})
        }
      }, 500)
    } catch (error) {
      if (version === this.connectionVersion) {
        this.snapshot = {
          ...empty(),
          error:
            error instanceof Error ? error.message : "Bot connection failed.",
        }
        this.listeners.forEach((fn) => fn())
      }
      throw error
    }
  }
  private rejectPending(message: string) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(message))
    }
    this.pending.clear()
  }
  private publication(client: MqttTransport, packet: Record<string, unknown>) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Bot command publication timed out.")),
        300
      )
      client.publish(
        `${this.configuration!.topicPrefix}/control`,
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
    })
  }
  private reply(key: number | "challenge") {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key)
        reject(new Error("Bot did not confirm the request. Retry access."))
      }, 5000)
      this.pending.set(key, { resolve, reject, timer })
    })
  }
  private send(
    action: string,
    data: Record<string, unknown>,
    wait = false,
    guard: () => boolean = () => true
  ): Promise<void> {
    const client = this.client
    const identity = this.identity
    const boot = this.state?.boot
    const epoch = this.state?.epoch
    const version = this.motionVersion
    const motion = ["car", "stop"].includes(action)
    const assertCurrent = () => {
      if (
        !client ||
        !identity ||
        !this.online ||
        this.client !== client ||
        this.identity !== identity ||
        this.state?.boot !== boot ||
        (motion && (this.state?.epoch !== epoch || !this.authorized)) ||
        (action !== "stop" &&
          motion &&
          (this.closing ||
            !!this.snapshot.error ||
            version !== this.motionVersion ||
            !guard()))
      ) {
        throw new Error("Bot movement cancelled or control changed.")
      }
    }
    const operation = async () => {
      assertCurrent()
      const seq = ++this.seq
      const packet = await signMessage(identity!, {
        boot: boot!,
        seq,
        action,
        data: { ...data, epoch },
      })
      assertCurrent()
      const response = wait ? this.reply(seq) : null
      response?.catch(() => {})
      try {
        await this.publication(client!, packet)
      } catch (error) {
        this.rejectPending("Bot publication failed.")
        throw error
      }
      return { response }
    }
    const result = this.chain.then(operation)
    this.chain = result.then(
      () => {},
      () => {}
    )
    return result.then(async ({ response }) => {
      if (response) {
        await response
      }
    })
  }
  async join(name: string) {
    const trimmed = name.trim()
    if (trimmed.length < 2 || trimmed.length > 24) {
      throw new Error("Use a control name with 2–24 characters.")
    }
    if (!this.online || !this.identity || !this.client || this.closing) {
      throw new Error("Wait for live bot telemetry before requesting access.")
    }
    if (this.pending.has("challenge")) {
      throw new Error("A control request is already pending.")
    }
    const identity = this.identity
    const boot = this.state!.boot
    const client = this.client
    const pending = this.reply("challenge")
    pending.catch(() => {})
    try {
      await this.publication(client, {
        v: 1,
        action: "challenge",
        session: identity.session,
        boot,
      })
    } catch (error) {
      this.rejectPending("Bot challenge failed.")
      throw error
    }
    const reply = await pending
    if (identity !== this.identity || boot !== this.state?.boot) {
      throw new Error("Bot rebooted. Retry access.")
    }
    await this.send(
      "join",
      { name: trimmed, key: identity.publicKey, challenge: reply.challenge },
      true
    )
  }
  move(
    action: Movement["action"],
    cmd: Movement["cmd"],
    speed: number,
    guard: () => boolean
  ) {
    const allowed = ["F", "B", "L", "R"]
    if (
      !allowed.includes(cmd) ||
      !Number.isInteger(speed) ||
      speed < 1 ||
      speed > 100
    ) {
      return Promise.reject(new Error("Invalid bot movement."))
    }
    return this.send(action, { cmd, speed }, false, guard)
  }
  cancelMotion() {
    this.motionVersion++
  }
  stop() {
    this.cancelMotion()
    return this.authorized
      ? this.send("stop", {}).catch(() => {})
      : Promise.resolve()
  }
  async disconnect() {
    this.connectionVersion++
    this.closing = true
    const client = this.client
    if (this.timer) {
      clearInterval(this.timer)
    }
    this.timer = null
    const stopping = this.stop()
    this.refresh()
    await stopping
    if (this.client === client && this.online && this.snapshot.joined) {
      await this.send("leave", {}).catch(() => {})
    }
    if (this.client === client) {
      this.client = null
      this.identity = null
      this.state = null
      this.connected = false
      this.lastSeen = -Infinity
      this.rejectPending("Bot disconnected.")
      this.snapshot = empty()
      this.listeners.forEach((fn) => fn())
    }
    client?.end(true)
  }
}
