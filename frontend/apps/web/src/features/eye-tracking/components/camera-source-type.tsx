import { Usb, Wifi } from "lucide-react"

export function CameraSourceType({
  value,
  onChange,
  label = "Camera type",
}: {
  value: "usb" | "network"
  onChange: (value: "usb" | "network") => void
  label?: string
}) {
  return (
    <div className="eye-source-type" role="group" aria-label={label}>
      <button
        className="eye-button secondary"
        aria-label="USB camera"
        title="USB camera"
        data-tooltip="USB camera"
        aria-pressed={value === "usb"}
        onClick={() => onChange("usb")}
      >
        <Usb size={19} aria-hidden="true" />
      </button>
      <button
        className="eye-button secondary"
        aria-label="Network stream"
        title="Network / IP / mDNS stream"
        data-tooltip="Network / IP / mDNS"
        aria-pressed={value === "network"}
        onClick={() => onChange("network")}
      >
        <Wifi size={19} aria-hidden="true" />
      </button>
    </div>
  )
}
