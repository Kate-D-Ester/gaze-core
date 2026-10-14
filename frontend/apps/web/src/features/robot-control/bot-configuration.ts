import type { BotConfiguration } from "./robot-control.types"

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
      "Use a ws:// or wss:// MQTT endpoint without embedded credentials."
    )
  }
  const commandTopic = input.commandTopic.trim()
  if (
    !commandTopic ||
    commandTopic.length > 128 ||
    /[+#\s]/.test(commandTopic) ||
    commandTopic.includes("\u0000")
  ) {
    throw new Error("Enter the car command topic without wildcards.")
  }
  if (input.mqttUsername.length > 256 || input.mqttPassword.length > 256) {
    throw new Error("Broker credentials are too long.")
  }
  return { ...input, mqttUrl: url.href, commandTopic }
}
