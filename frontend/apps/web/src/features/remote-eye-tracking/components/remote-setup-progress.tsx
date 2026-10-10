import { Check } from "lucide-react"
import { IconButton } from "../remote-controls"
import { REMOTE_STEPS } from "./remote-setup"
import { RemoteStepsStyles } from "@/features/tracking-ui/remote-styles"
import type { RemoteSetupProgressProps } from "./remote-setup-progress.types"
export function RemoteSetupProgress({
  step,
  replaying,
  allowedSteps,
  onStepChange,
}: RemoteSetupProgressProps) {
  return (
    <ol
      className={`remote-steps ${RemoteStepsStyles}`}
      aria-label="Setup progress"
    >
      {(replaying ? REMOTE_STEPS.slice(0, 3) : REMOTE_STEPS).map(
        (item, index) => (
          <li
            key={item.id}
            aria-current={step === item.id ? "step" : undefined}
            className={item.id <= step ? "active" : ""}
          >
            <IconButton
              label={`${index + 1}. ${replaying && item.id === 3 ? "Inspect" : item.label}`}
              icon={item.id < step ? Check : item.icon}
              aria-current={step === item.id ? "step" : undefined}
              disabled={!allowedSteps.includes(item.id)}
              onClick={() => onStepChange(item.id)}
            />
          </li>
        )
      )}
    </ol>
  )
}
