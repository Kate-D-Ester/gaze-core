import { Button } from "@workspace/ui/components/button"
import type { AudioDeviceControlsProps } from "./audio-device-controls.types"
export function AudioDeviceControls({
  devices,
  snapshot,
  listening,
  active,
  onOutput,
}: AudioDeviceControlsProps) {
  const selection = snapshot.selection
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 space-y-1 text-xs">
          <span className="block text-muted-foreground">Microphone</span>
          <select
            aria-label="Microphone"
            value={selection.microphoneId}
            disabled={!active || listening || snapshot.busy}
            title={
              listening ? "Stop listening to change the microphone" : undefined
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            onChange={(event) => devices.setMicrophone(event.target.value)}
          >
            <option value="">System default</option>
            {selection.microphoneId &&
              !snapshot.inputs.some(
                (device) => device.deviceId === selection.microphoneId
              ) && (
                <option value={selection.microphoneId} disabled>
                  Saved microphone · reconnect or select another
                </option>
              )}
            {snapshot.inputs.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-40 flex-1 space-y-1 text-xs">
          <span className="block text-muted-foreground">
            Speaker / headphones
          </span>
          <select
            aria-label="Speaker / headphones"
            value={selection.outputId}
            disabled={
              !active ||
              snapshot.busy ||
              (!snapshot.outputSupported && !selection.outputId)
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            onChange={(event) => {
              void devices.setOutput(event.target.value, onOutput)
            }}
          >
            <option value="">System default</option>
            {selection.outputId &&
              !snapshot.outputs.some(
                (device) => device.deviceId === selection.outputId
              ) && (
                <option value={selection.outputId} disabled>
                  Saved output · reconnect or select another
                </option>
              )}
            {snapshot.outputSupported &&
              snapshot.outputs.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Speaker ${index + 1}`}
                </option>
              ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={!active || listening || snapshot.busy}
          onClick={() => {
            void devices.enable()
          }}
        >
          {snapshot.busy ? "Finding devices…" : "Enable audio devices"}
        </Button>
      </div>
      {!snapshot.outputSupported && (
        <p className="text-xs text-muted-foreground">
          This browser uses your system sound output. Choose headphones in
          system sound settings.
        </p>
      )}
      {(snapshot.inputMissing || snapshot.outputMissing) && (
        <p role="alert" className="text-xs text-amber-200">
          A selected audio device disconnected. Reconnect it or choose another
          device.
        </p>
      )}
      {snapshot.error && (
        <p role="alert" className="text-xs text-amber-200">
          {snapshot.error}
        </p>
      )}
    </div>
  )
}
