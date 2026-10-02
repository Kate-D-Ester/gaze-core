import { Info } from "lucide-react"
import { useId, useState } from "react"

export function HelpTip({
  text,
  label = "Help",
}: {
  text: string
  label?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  return (
    <span
      className="eye-help-tip"
      data-open={open || undefined}
      data-dismissed={dismissed || undefined}
      onMouseEnter={() => setDismissed(false)}
    >
      <button
        type="button"
        className="eye-icon-button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => {
          setDismissed(open)
          setOpen(!open)
        }}
        onFocus={() => setDismissed(false)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false)
            setDismissed(true)
          }
        }}
      >
        <Info size={15} aria-hidden="true" />
      </button>
      <span id={id} role="tooltip">
        {text}
      </span>
    </span>
  )
}
