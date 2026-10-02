import { buttonVariants } from "@workspace/ui/components/button-variants"
import { ArrowRight, Monitor, ScanFace, Video } from "lucide-react"
import Link from "next/link"
import type { TrackingTrial } from "./tracking-trials.types"
const TRIALS: readonly TrackingTrial[] = [
  {
    name: "Screen eye tracking",
    description: "Use your head-mounted eye camera to track screen gaze.",
    path: "/trial/screen-eye-tracking",
    icon: Monitor,
  },
  {
    name: "Remote eye tracking",
    description: "Track with a webcam, phone, or IR camera.",
    path: "/trial/remote-eye-tracking",
    icon: ScanFace,
  },
  {
    name: "Scene camera eye tracking",
    description: "Map eye gaze onto an outward-facing camera view.",
    path: "/trial/scene-camera-eye-tracking",
    icon: Video,
  },
]
export function TrackingTrials() {
  return (
    <section aria-labelledby="tracking-trials-heading" className="space-y-3">
      <h2 id="tracking-trials-heading" className="text-lg font-semibold">
        Eye tracking
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {TRIALS.map(({ name, description, path, icon: Icon }) => (
          <article
            key={path}
            aria-label={name}
            className="flex flex-col rounded-xl border bg-card p-5"
          >
            <Icon
              size={24}
              className="mb-4 text-foreground"
              aria-hidden="true"
            />
            <h3 className="text-base leading-snug font-semibold">{name}</h3>
            <p className="mt-2 mb-6 text-sm text-muted-foreground">
              {description}
            </p>
            <Link
              href={path}
              aria-label={`Try it out: ${name}`}
              className={buttonVariants({
                className: "mt-auto min-h-11 w-full",
              })}
            >
              Try it out
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  )
}
