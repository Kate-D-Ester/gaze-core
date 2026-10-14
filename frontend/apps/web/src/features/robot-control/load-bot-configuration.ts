import { validateBotConfiguration } from "./bot-configuration"
import type { BotConfiguration } from "./robot-control.types"

export async function loadBotConfiguration(
  signal: AbortSignal
): Promise<BotConfiguration> {
  const response = await fetch("/api/bot-config", { cache: "no-store", signal })
  if (!response.ok) {
    throw new Error("Bot MQTT is not configured locally.")
  }
  const value = await response.json()
  if (
    !value ||
    typeof value.mqttUrl !== "string" ||
    typeof value.commandTopic !== "string" ||
    typeof value.mqttUsername !== "string" ||
    typeof value.mqttPassword !== "string"
  ) {
    throw new Error("Bot MQTT configuration is invalid.")
  }
  return validateBotConfiguration(value)
}
