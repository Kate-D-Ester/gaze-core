import { MoveHorizontal, MoveVertical, RotateCw, Maximize2 } from "lucide-react"
import { Hint } from "../remote-controls"
import { RemoteHeadReadoutStyles } from "@/features/tracking-ui/remote-styles"
import { degrees, percentage } from "./readout-format"
import type { HeadReadoutProps } from "./head-readout.types"
export function HeadReadout({ pose, reference }: HeadReadoutProps) {
  const isFace = !reference
  const values = [
    {
      label: isFace ? "Yaw" : "Reference X",
      icon: MoveHorizontal,
      value: isFace ? degrees(pose?.yaw ?? null) : percentage(pose?.x),
    },
    {
      label: isFace ? "Pitch" : "Reference Y",
      icon: MoveVertical,
      value: isFace ? degrees(pose?.pitch ?? null) : percentage(pose?.y),
    },
    {
      label: isFace ? "Roll" : "Eye scale",
      icon: isFace ? RotateCw : Maximize2,
      value: isFace ? degrees(pose?.roll ?? null) : percentage(pose?.scale, 1),
    },
  ]
  return (
    <div className={`remote-head-readout ${RemoteHeadReadoutStyles}`}>
      {values.map((item) => (
        <Hint key={item.label} label={`${item.label}: ${item.value}`}>
          <item.icon size={15} aria-hidden="true" />
          <strong>{item.value}</strong>
        </Hint>
      ))}
    </div>
  )
}
