import type { BotControlsProps } from "./bot-controls.types"
import { useEffect, useId, useRef, useState } from "react"
import { SlidersHorizontal } from "lucide-react"
import { hasFreshFrame } from "../camera-viewer/selection"
import { EyeButtonStyles, EyeFieldStyles } from "../tracking-ui/control-styles"
import { DEFAULT_FOLLOW_SETTINGS } from "./visual-servo"
import { useBotControl } from "./use-bot-control"
import { loadBotConfiguration } from "./load-bot-configuration"
import type { FollowSettings } from "./robot-control.types"

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
  const [settings, setSettings] = useState<FollowSettings>(
    DEFAULT_FOLLOW_SETTINGS
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const connectionRequest = useRef<AbortController | null>(null)
  useEffect(() => () => connectionRequest.current?.abort(), [])
  const id = useId()
  const failure = error || robot.error || following.error
  let status = "Bot disconnected"
  if (busy || robot.connecting) {
    status = "Connecting bot…"
  } else if (robot.connected) {
    status = "MQTT connected"
    if (following.enabled) {
      status = "Waiting for Target"
      if (following.phase === "moving") {
        status = following.command
      } else if (following.phase === "holding") {
        status = "Holding position"
      }
    }
  }
  async function connect() {
    if (busy) {
      return
    }
    setBusy(true)
    setError("")
    connectionRequest.current?.abort()
    const request = new AbortController()
    connectionRequest.current = request
    try {
      if (robot.connected || robot.connecting) {
        follower.disable()
        await session.disconnect()
      } else {
        const configuration = await loadBotConfiguration(request.signal)
        if (!request.signal.aborted) {
          await session.connect(configuration)
        }
      }
    } catch (failure) {
      if (!request.signal.aborted) {
        setError(
          failure instanceof Error ? failure.message : "Bot connection failed."
        )
      }
    } finally {
      if (!request.signal.aborted) {
        setBusy(false)
      }
    }
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
          disabled={busy}
          onClick={() => void connect()}
        >
          {robot.connected || robot.connecting
            ? "Disconnect bot"
            : "Connect bot"}
        </button>
        <span
          role={failure ? "alert" : "status"}
          className={`min-w-28 flex-1 text-xs break-words ${failure ? "text-red-200" : "text-muted-foreground"}`}
        >
          {failure || status}
        </span>
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
          disabled={!robot.connected && !following.enabled}
          onClick={() => {
            follower.disable()
            setError("")
          }}
        >
          Stop bot
        </button>
        <button
          type="button"
          className={`secondary ${EyeButtonStyles}`}
          aria-expanded={open}
          aria-controls={id}
          aria-label="Follow settings"
          title="Follow settings"
          onClick={() => setOpen(!open)}
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
        </button>
      </div>
      {open && (
        <div id={id} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={EyeFieldStyles}>
            <span>Max turn speed (%)</span>
            <input
              aria-label="Maximum turn speed"
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
      )}
    </div>
  )
}
