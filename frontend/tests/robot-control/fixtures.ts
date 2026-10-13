export const configuration = {
  mqttUrl: "wss://broker.example/mqtt",
  topicPrefix: "zero/test",
  mqttUsername: "",
  mqttPassword: "",
}
export class Broker {
  handlers = new Map<string, Function[]>()
  sent: { topic: string; packet: any; options: any }[] = []
  constructor(public status: any) {}
  on(name: string, callback: Function) {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), callback])
    return this
  }
  emit(name: string, ...args: any[]) {
    this.handlers.get(name)?.forEach((fn) => fn(...args))
  }
  subscribe(topics: string[], options: any, callback: Function) {
    callback(null)
  }
  publish(topic: string, value: string, options: any, callback: Function) {
    const packet = JSON.parse(value)
    this.sent.push({ topic, packet, options })
    callback(null)
    if (packet.action === "challenge")
      queueMicrotask(() =>
        this.message(`zero/test/reply/${packet.session}`, {
          session: packet.session,
          boot: this.status.boot,
          ok: true,
          challenge: "b".repeat(32),
        })
      )
    if (packet.action === "leave") {
      this.status = {
        ...this.status,
        queue: this.status.queue.filter(
          (user: any) => user.session !== packet.session
        ),
        current: "",
      }
    }
    if (packet.action === "join") {
      queueMicrotask(() => {
        const data = JSON.parse(packet.data)
        const duplicate = this.status.queue.some(
          (user: any) =>
            user.session !== packet.session &&
            user.name.toLowerCase() === data.name.toLowerCase()
        )
        if (duplicate) {
          this.message(`zero/test/reply/${packet.session}`, {
            session: packet.session,
            seq: packet.seq,
            ok: false,
            error: "Username already in use",
          })
          return
        }
        this.status = {
          ...this.status,
          current: packet.session,
          queue: [{ name: data.name, session: packet.session }],
        }
        this.message(`zero/test/reply/${packet.session}`, {
          session: packet.session,
          seq: packet.seq,
          ok: true,
        })
        this.message("zero/test/state", this.status)
      })
    }
  }
  message(topic: string, payload: any, retain = false) {
    this.emit(
      "message",
      topic,
      new TextEncoder().encode(JSON.stringify(payload)),
      { retain }
    )
  }
  end(force: boolean, options: any, callback?: Function) {
    callback?.()
  }
}
export const status = () => ({
  status: "online",
  boot: "a".repeat(32),
  epoch: 2,
  current: "",
  master: false,
  queue_mode: "automatic",
  queue: [],
})
