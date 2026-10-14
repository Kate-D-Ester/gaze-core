export const configuration = {
  mqttUrl: "wss://broker.example/mqtt",
  commandTopic: "test/car/command",
  mqttUsername: "",
  mqttPassword: "",
}
/** Transport boundary only: no invented robot telemetry or access protocol. */
export class Broker {
  handlers = new Map<string, Function[]>()
  sent: { topic: string; packet: any; options: any }[] = []
  ended = false
  on(name: string, callback: Function) {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), callback])
    return this
  }
  emit(name: string, ...args: any[]) {
    this.handlers.get(name)?.forEach((fn) => fn(...args))
  }
  publish(topic: string, value: string, options: any, callback: Function) {
    this.sent.push({ topic, packet: JSON.parse(value), options })
    callback(null)
  }
  end() {
    this.ended = true
  }
}
