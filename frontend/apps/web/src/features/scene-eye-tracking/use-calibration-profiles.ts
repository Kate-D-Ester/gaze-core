import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  deleteSceneProfile,
  readSceneProfiles,
  saveSceneProfile,
  sceneProfileSetupIssue,
  selectSceneProfile,
} from "./calibration-profiles"
import { canUseSceneCalibration } from "./scene-session"
import type { SceneCalibration } from "./scene.types"
import type {
  CalibrationProfilesController,
  UseCalibrationProfilesOptions,
} from "./use-calibration-profiles.types"
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not update the saved calibration."
}
export function useCalibrationProfiles({
  session,
  state,
  setup,
  ready,
  disabled,
  onLoaded,
}: UseCalibrationProfilesOptions): CalibrationProfilesController {
  const [library, setLibrary] = useState(readSceneProfiles)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const restoredOnce = useRef(false)
  const selectedMapping = useRef<SceneCalibration | null>(null)
  const { calibration, method, offset, delayMs } = state
  const unverified = !canUseSceneCalibration(state)
  const profileData = useMemo(() => {
    if (!calibration) {
      return null
    }
    return { calibration, method, offset, delayMs, unverified }
  }, [calibration, method, offset, delayMs, unverified])
  const canSave = !disabled && !state.capture && !!calibration
  const load = useCallback(
    (id: string) => {
      if (!ready || disabled) {
        return
      }
      try {
        const saved = readSceneProfiles()
        const profile = saved.profiles.find((item) => item.id === id)
        if (!profile) {
          throw new Error("This profile is no longer available.")
        }
        const issue = sceneProfileSetupIssue(profile, setup)
        if (issue) {
          throw new Error(issue)
        }
        selectSceneProfile(id)
        session.restoreCalibration(profile)
        selectedMapping.current = session.getSnapshot().calibration
        setSelectedId(id)
        setLibrary(readSceneProfiles())
        setError("")
        setMessage(
          profile.unverified
            ? "Loaded · accuracy not verified"
            : "Loaded · adjust X/Y if needed"
        )
        onLoaded()
      } catch (cause) {
        setError(errorMessage(cause))
      }
    },
    [disabled, onLoaded, ready, session, setup]
  )
  useEffect(() => {
    if (!ready || disabled || restoredOnce.current) {
      return
    }
    restoredOnce.current = true
    if (!state.calibration && library.selectedId) {
      load(library.selectedId)
    }
  }, [disabled, library.selectedId, load, ready, state.calibration])
  useEffect(() => {
    if (selectedId && selectedMapping.current !== state.calibration) {
      selectedMapping.current = null
      setSelectedId(null)
      setMessage("")
    }
  }, [selectedId, state.calibration])
  useEffect(() => {
    const profile = library.profiles.find((item) => item.id === selectedId)
    if (
      !profile ||
      !canSave ||
      !profileData ||
      selectedMapping.current !== profileData.calibration
    ) {
      return
    }
    const changed =
      profile.delayMs !== profileData.delayMs ||
      !!profile.unverified !== profileData.unverified ||
      profile.offset.some((value, axis) => value !== profileData.offset[axis])
    if (!changed) {
      return
    }
    try {
      saveSceneProfile(profile.name, profileData, profile.setup, profile.id)
      setLibrary(readSceneProfiles())
      setError("")
      setMessage(
        profileData.unverified
          ? "Saved on this device · accuracy not verified"
          : "Adjustment saved"
      )
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }, [canSave, library.profiles, profileData, selectedId])
  function save(name: string, profileId?: string) {
    if (!canSave || !profileData) {
      return false
    }
    try {
      const profile = saveSceneProfile(name, profileData, setup, profileId)
      selectedMapping.current = state.calibration
      setSelectedId(profile.id)
      setLibrary(readSceneProfiles())
      setError("")
      setMessage(
        profileData.unverified
          ? "Saved on this device · accuracy not verified"
          : "Saved on this device"
      )
      return true
    } catch (cause) {
      setError(errorMessage(cause))
      return false
    }
  }
  function clearError() {
    setError("")
  }
  function remove() {
    if (disabled || !selectedId) {
      return
    }
    try {
      deleteSceneProfile(selectedId)
      selectedMapping.current = null
      setSelectedId(null)
      setLibrary(readSceneProfiles())
      setError("")
      setMessage("Profile removed · current gaze kept")
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }
  return {
    profiles: library.profiles,
    selectedId,
    error,
    message,
    disabled,
    canLoad: ready && !disabled,
    canSave,
    load,
    save,
    clearError,
    remove,
  }
}
