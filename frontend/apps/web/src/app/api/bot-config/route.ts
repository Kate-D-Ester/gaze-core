import { validateBotConfiguration } from "@/features/robot-control/bot-configuration"

export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "no-store" }

/** Local preview configuration; never expose it to a cross-origin browser request. */
export function GET(request: Request) {
  const serverUrl = new URL(request.url)
  let url: URL
  try {
    url = new URL(
      `${serverUrl.protocol}//${request.headers.get("host") ?? serverUrl.host}`
    )
  } catch {
    return Response.json(
      { error: "Local access only." },
      { status: 403, headers }
    )
  }
  const origin = request.headers.get("origin")
  const site = request.headers.get("sec-fetch-site")
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !!url.username ||
    !!url.password ||
    url.pathname !== "/" ||
    !!url.search ||
    !!url.hash ||
    (origin && origin !== url.origin) ||
    (site && site !== "same-origin" && site !== "none")
  ) {
    return Response.json(
      { error: "Local access only." },
      { status: 403, headers }
    )
  }
  try {
    const configuration = validateBotConfiguration({
      mqttUrl: process.env.GAZE_BOT_MQTT_URL ?? "",
      commandTopic:
        process.env.GAZE_BOT_COMMAND_TOPIC ?? "alice/zero/car/command",
      mqttUsername: process.env.GAZE_BOT_MQTT_USERNAME ?? "",
      mqttPassword: process.env.GAZE_BOT_MQTT_PASSWORD ?? "",
    })
    return Response.json(configuration, { headers })
  } catch {
    return Response.json(
      { error: "Bot MQTT is not configured locally." },
      { status: 503, headers }
    )
  }
}
