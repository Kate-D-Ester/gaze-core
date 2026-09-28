import { Check, ChevronRight } from "lucide-react"
import type { V2StepNavigationProps } from "./v2-step-navigation.types"

export function V2StepNavigation({
  steps,
  activeStep,
  completedSteps,
  availableSteps,
  onSelectStep,
}: V2StepNavigationProps) {
  return (
    <nav className="eye-step-nav" aria-label="Setup steps">
      <ol className="eye-breadcrumbs">
        {steps.map((name, index) => {
          const isActive = index === activeStep
          const isComplete = completedSteps.has(index)
          const classNames = ["eye-step"]

          if (isActive) classNames.push("active")
          if (isComplete) classNames.push("done")

          return (
            <li key={name}>
              <button
                className={classNames.join(" ")}
                aria-current={isActive ? "step" : undefined}
                disabled={!availableSteps.has(index)}
                onClick={() => onSelectStep(index)}
              >
                <span className="eye-step-number">
                  {isComplete ? (
                    <Check size={13} />
                  ) : (
                    String(index + 1).padStart(2, "0")
                  )}
                </span>
                <span className="eye-step-text">{name}</span>
              </button>
              {index < steps.length - 1 && (
                <ChevronRight
                  className="eye-step-chevron"
                  size={14}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
