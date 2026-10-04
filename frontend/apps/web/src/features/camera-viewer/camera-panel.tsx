import { Cable, Video, Wifi } from "lucide-react"
import { useCameraSourcePreferences } from "../eye-tracking/use-camera-source-preferences"
import { SavedCameraOption } from "../eye-tracking/components/saved-camera-option"
import { CameraTransformControls } from "../eye-tracking/components/camera-transform-controls"
import { NETWORK_CONNECTION_LABELS } from "../eye-tracking/network-camera"
import {
  EyeButtonStyles,
  EyeFieldStyles,
  EyeSourceTypeStyles,
} from "../tracking-ui/control-styles"
import { StatusLightStyles } from "../tracking-ui/layout-styles"
import { CameraPreview } from "./camera-preview"
import type { CameraPanelProps } from "./camera-panel.types"

export function CameraPanel({
  role,
  label,
  camera,
  state,
  active,
  connectionPending,
  excludedDevices,
  selection,
  gazeSession,
  tracking,
  region,
  onRegion,
  now = 0,
  onActivate,
  onConnect,
  onDisconnect,
  onPoint,
}: CameraPanelProps) {
  const { kind, setKind, deviceId, setDeviceId, url, setUrl } =
    useCameraSourcePreferences(
      role === "eye" ? "scene-eye" : role,
      state.source
    )
  const disabled =
    connectionPending || state.busy || camera.canConnect === false
  return (
    <section
      id={`${role}-camera-panel`}
      className={`min-w-0 scroll-mt-4 self-start overflow-hidden rounded-lg border bg-card ${active ? "border-primary/70" : "border-border"}`}
      aria-labelledby={`${role}-camera-title`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-3">
        <button
          type="button"
          aria-label={`Use ${label}`}
          aria-pressed={active}
          onClick={onActivate}
          className="flex min-h-9 items-center gap-2 rounded px-1 text-sm font-semibold"
        >
          <span
            className={`${StatusLightStyles} ${state.connection === "live" ? "on" : ""}`}
          />
          <span id={`${role}-camera-title`}>{label}</span>
          {active && (
            <span className="text-[10px] font-normal text-primary">Active</span>
          )}
        </button>
        <div className="flex items-center gap-1">
          <details className="relative text-xs">
            <summary className="cursor-pointer rounded px-2 py-2 text-muted-foreground">
              Orientation
            </summary>
            <div className="absolute top-full right-0 z-20 mt-2 rounded-md border bg-card p-2 shadow-lg">
              <CameraTransformControls
                label={label}
                value={state.transform}
                onChange={camera.setTransform}
                disabled={state.busy}
              />
            </div>
          </details>
        </div>
      </header>
      <CameraPreview
        label={label}
        camera={camera}
        state={state}
        selection={selection}
        gazeSession={gazeSession}
        tracking={tracking}
        trackingRole={role === "eye" ? undefined : role}
        region={region}
        onRegion={onRegion}
        now={now}
        onPoint={onPoint}
      />
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-y px-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Wifi size={14} aria-hidden="true" />
          {NETWORK_CONNECTION_LABELS[state.connection]}
          {state.retryAttempt > 0 && ` · Retry ${state.retryAttempt}`}
        </span>
        {state.frame && (
          <span>
            {state.frame.width} × {state.frame.height} ·{" "}
            {state.transform.rotation}°
          </span>
        )}
      </div>
      <div className="p-4">
        <form
          aria-label={`${label} source`}
          onSubmit={(event) => {
            event.preventDefault()
            onConnect(
              kind === "usb" ? "camera" : "network",
              kind === "usb" ? deviceId : url
            )
          }}
        >
          <fieldset disabled={disabled}>
            <legend className="sr-only">{label} connection</legend>
            <div
              className={EyeSourceTypeStyles}
              role="group"
              aria-label={`${label} source type`}
            >
              <button
                type="button"
                className={`secondary ${EyeButtonStyles}`}
                aria-pressed={kind === "usb"}
                onClick={() => setKind("usb")}
              >
                <Cable size={14} aria-hidden="true" />
                USB camera
              </button>
              <button
                type="button"
                className={`secondary ${EyeButtonStyles}`}
                aria-pressed={kind === "network"}
                onClick={() => setKind("network")}
              >
                <Wifi size={14} aria-hidden="true" />
                Network
              </button>
            </div>
            {kind === "usb" ? (
              <label className={EyeFieldStyles}>
                Camera device
                <select
                  aria-label={`${label} USB device`}
                  value={deviceId}
                  onChange={(event) => setDeviceId(event.target.value)}
                >
                  <option value="">Default camera</option>
                  <SavedCameraOption
                    deviceId={deviceId}
                    devices={state.devices}
                  />
                  {state.devices.map((device, index) => (
                    <option
                      key={device.deviceId}
                      value={device.deviceId}
                      disabled={excludedDevices.includes(device.deviceId)}
                    >
                      {device.label || `Camera ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className={EyeFieldStyles}>
                Stream URL
                <input
                  aria-label={`${label} network URL`}
                  type="url"
                  required
                  placeholder="http://camera.local/stream"
                  autoComplete="off"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </label>
            )}
            <button
              type="submit"
              className={`primary w-full ${EyeButtonStyles}`}
            >
              <Video size={14} aria-hidden="true" />
              {state.busy ? "Connecting…" : "Connect"}
            </button>
          </fieldset>
        </form>
        <button
          type="button"
          aria-label={`${label} disconnect`}
          disabled={!state.source && !state.busy}
          className={`secondary mt-2 w-full ${EyeButtonStyles}`}
          onClick={onDisconnect}
        >
          Disconnect
        </button>
        {state.error && (
          <p role="alert" className="mt-3 text-xs leading-relaxed text-red-200">
            {state.error}
          </p>
        )}
      </div>
    </section>
  )
}
