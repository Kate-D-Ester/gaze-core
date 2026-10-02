import { Eye } from "lucide-react"
import Link from "next/link"
import {
  EyeBrandStyles,
  EyeLogoStyles,
  EyeVersionStyles,
} from "./layout-styles"
import type { TrackingBrandProps } from "./tracking-brand.types"
export function TrackingBrand({ version }: TrackingBrandProps) {
  return (
    <Link href="/dashboard" className={`eye-brand ${EyeBrandStyles}`}>
      <span className={`eye-logo ${EyeLogoStyles}`}>
        <Eye size={21} />
      </span>
      GazeCore
      <span className={`eye-version ${EyeVersionStyles}`}>{version}</span>
    </Link>
  )
}
