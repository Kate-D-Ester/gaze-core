import { REMOTE_MODES } from "./remote-setup"
import {
  RemotePickerStyles,
  RemoteCardsStyles,
  RemoteModeCardStyles,
  RemoteTooltipStyles,
} from "@/features/tracking-ui/remote-styles"
import type { RemoteModePickerProps } from "./remote-mode-picker.types"
export function RemoteModePicker({ onChoose }: RemoteModePickerProps) {
  return (
    <div className={`remote-picker ${RemotePickerStyles}`}>
      <p>Choose a camera</p>
      <div className={`remote-cards ${RemoteCardsStyles}`}>
        {REMOTE_MODES.map((item) => (
          <button
            type="button"
            className={`remote-mode-card ${RemoteModeCardStyles}`}
            key={item.id}
            aria-label={item.title}
            onClick={() => onChoose(item.id)}
          >
            <item.icon size={34} strokeWidth={1.5} aria-hidden="true" />
            <h2>{item.short}</h2>
            <span
              className={`remote-tooltip ${RemoteTooltipStyles}`}
              aria-hidden="true"
            >
              {item.hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
