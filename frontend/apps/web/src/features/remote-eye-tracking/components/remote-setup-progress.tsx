import { Check } from "lucide-react"
import { Hint } from "../remote-controls"
import { REMOTE_STEPS } from "./remote-setup"
import { RemoteStepsStyles } from "@/features/tracking-ui/remote-styles"
import type { RemoteSetupProgressProps } from "./remote-setup-progress.types"
export function RemoteSetupProgress({
  step,
  replaying,
}: RemoteSetupProgressProps) {
  return (
    <ol
      className={`remote-steps ${RemoteStepsStyles}`}
      aria-label="Setup progress"
    >
      {(replaying ? REMOTE_STEPS.slice(0, 3) : REMOTE_STEPS).map(
        (item, index) => (
          <li
            key={item.label}
            aria-current={step === index ? "step" : undefined}
            className={index <= step ? "active" : ""}
          >
            <Hint label={`${index + 1}. ${item.label}`}>
              {index < step ? <Check size={17} /> : <item.icon size={18} />}
            </Hint>
          </li>
        )
      )}
    </ol>
  )
}
