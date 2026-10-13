import type { BotControlsProps } from "./bot-controls.types"
import { useId, useState } from "react"
import { hasFreshFrame } from "../camera-viewer/selection"
import { EyeButtonStyles, EyeFieldStyles } from "../tracking-ui/control-styles"
import { DEFAULT_FOLLOW_SETTINGS } from "./visual-servo"
import { useBotControl } from "./use-bot-control"
import type { BotConfiguration, FollowSettings } from "./robot-control.types"

const emptyConfig: BotConfiguration = {
  mqttUrl: "",
  topicPrefix: "",
  mqttUsername: "",
  mqttPassword: "",
}
export function BotControls({
  tracking,
  scene,
  target,
  visible = true,
  session: supplied,
}: BotControlsProps) {
  const { session, follower, robot, following, tracked, targetState } =
    useBotControl(tracking, scene, target, visible, supplied)
  const [open, setOpen] = useState(false)
  const [configuration, setConfiguration] = useState(emptyConfig)
  const [settings, setSettings] = useState<FollowSettings>(
    DEFAULT_FOLLOW_SETTINGS
  )
  const [name, setName] = useState("Gaze viewer")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const id = useId()
  const failure = error || robot.error || following.error
  let status = "Bot disconnected"
  if (robot.connecting) {
    status = "Connecting bot…"
  } else if (robot.connected && !robot.online) {
    status = "Waiting for bot…"
  } else if (robot.online) {
    status = robot.joined ? "Waiting for access" : "Request control"
    if (robot.canControl) {
      status = "Bot ready"
    }
    if (following.enabled) {
      status = "Waiting for Target"
      if (following.phase === "moving") {
        status = following.command
      } else if (following.phase === "holding") {
        status = "Holding position"
      }
    }
  }

  async function run(operation: () => Promise<unknown>) {
    if (busy) {
      return
    }
    setBusy(true)
    setError("")
    try {
      await operation()
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Bot request failed."
      )
    } finally {
      setBusy(false)
    }
  }
  function configure(key: keyof BotConfiguration, value: string) {
    follower.disable()
    setError("")
    setConfiguration((current) => ({ ...current, [key]: value }))
  }
  function changeSettings(next: FollowSettings) {
    follower.disable()
    setError("")
    setSettings(next)
  }
  return (
    <div className="mt-2 border-t pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`secondary ${EyeButtonStyles}`}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          Bot settings
        </button>
        <span
          role={failure ? "alert" : "status"}
          className={`min-w-0 flex-1 text-xs ${failure ? "text-red-200" : "text-muted-foreground"}`}
        >
          {failure || status}
        </span>
        {robot.online && !robot.joined && !robot.canControl && (
          <button
            type="button"
            className={`secondary ${EyeButtonStyles}`}
            disabled={busy}
            onClick={() => void run(() => session.join(name))}
          >
            Request control
          </button>
        )}
        <button
          type="button"
          className={`primary ${EyeButtonStyles}`}
          aria-pressed={following.enabled}
          disabled={
            busy ||
            !visible ||
            !robot.canControl ||
            !tracked.reference ||
            !hasFreshFrame(targetState, performance.now())
          }
          onClick={() => {
            setError("")
            try {
              follower.enable(settings)
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Following unavailable."
              )
            }
          }}
        >
          Follow
        </button>
        <button
          type="button"
          className={`secondary ${EyeButtonStyles}`}
          disabled={!robot.canControl && !following.enabled}
          onClick={() => {
            follower.disable()
            setError("")
          }}
        >
          Stop bot
        </button>
      </div>
      {open && (
        <div id={id} className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
          <form
            aria-label="Bot connection"
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault()
              void run(async () => {
                await session.connect(configuration)
                setOpen(false)
              })
            }}
          >
            <label className={EyeFieldStyles}>
              <span>MQTT WebSocket endpoint</span>
              <input
                aria-label="Bot MQTT endpoint"
                placeholder="wss://broker.example/mqtt"
                value={configuration.mqttUrl}
                required
                maxLength={512}
                autoComplete="off"
                disabled={robot.connected || robot.connecting}
                onChange={(event) => configure("mqttUrl", event.target.value)}
              />
            </label>
            <label className={EyeFieldStyles}>
              <span>Topic prefix</span>
              <input
                aria-label="Bot topic prefix"
                placeholder="zero/your-bot"
                value={configuration.topicPrefix}
                required
                maxLength={128}
                autoComplete="off"
                disabled={robot.connected || robot.connecting}
                onChange={(event) =>
                  configure("topicPrefix", event.target.value)
                }
              />
            </label>
            <label className={EyeFieldStyles}>
              <span>Broker username (optional)</span>
              <input
                aria-label="Bot broker username"
                value={configuration.mqttUsername}
                maxLength={256}
                autoComplete="off"
                disabled={robot.connected || robot.connecting}
                onChange={(event) =>
                  configure("mqttUsername", event.target.value)
                }
              />
            </label>
            <label className={EyeFieldStyles}>
              <span>Broker password (optional)</span>
              <input
                aria-label="Bot broker password"
                type="password"
                value={configuration.mqttPassword}
                maxLength={256}
                autoComplete="off"
                disabled={robot.connected || robot.connecting}
                onChange={(event) =>
                  configure("mqttPassword", event.target.value)
                }
              />
            </label>
            <label className={EyeFieldStyles}>
              <span>Control name</span>
              <input
                aria-label="Bot control name"
                value={name}
                minLength={2}
                maxLength={24}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="flex items-end">
              {robot.connected || robot.connecting ? (
                <button
                  type="button"
                  className={`secondary ${EyeButtonStyles}`}
                  disabled={busy}
                  onClick={() => void run(() => session.disconnect())}
                >
                  Disconnect bot
                </button>
              ) : (
                <button
                  type="submit"
                  className={`secondary ${EyeButtonStyles}`}
                  disabled={busy}
                >
                  Connect bot
                </button>
              )}
            </div>
          </form>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={EyeFieldStyles}>
              <span>Object width (%)</span>
              <input
                aria-label="Desired target width"
                type="number"
                min={10}
                max={80}
                step={1}
                value={Math.round(settings.desiredWidth * 100)}
                onChange={(event) =>
                  changeSettings({
                    ...settings,
                    desiredWidth: Number(event.target.value) / 100,
                  })
                }
              />
            </label>
            <label className={EyeFieldStyles}>
              <span>Drive speed (%)</span>
              <input
                aria-label="Bot drive speed"
                type="number"
                min={1}
                max={100}
                step={1}
                value={settings.speed}
                onChange={(event) =>
                  changeSettings({
                    ...settings,
                    speed: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Use the controller’s broker and topic. Left/right turns the car.
            Rotate Target upright. Object width controls apparent size, not
            measured distance.
          </p>
        </div>
      )}
    </div>
  )
}
