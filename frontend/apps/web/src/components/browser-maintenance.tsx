"use client"

import { useEffect } from "react"
import { clearLegacySignInCredentials } from "@/lib/legacy-sign-in-cleanup"

/** Applies one-time browser data migrations on every route, including public trials. */
export function BrowserMaintenance() {
  useEffect(clearLegacySignInCredentials, [])
  return null
}
