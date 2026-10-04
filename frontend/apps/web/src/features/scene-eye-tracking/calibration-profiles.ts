import { isSceneCalibrationProfile } from "./calibration-profile-validation"
import type {
  SceneCalibrationProfile,
  SceneProfileCalibration,
  SceneProfileLibrary,
  SceneProfileSetup,
} from "./calibration-profiles.types"
export const SCENE_PROFILE_STORAGE_KEY =
  "gazecore.scene.calibration-profiles.v1"
const MAX_PROFILES = 20
function emptyLibrary(): SceneProfileLibrary {
  return { version: 1, selectedId: null, profiles: [] }
}
export function readSceneProfiles(): SceneProfileLibrary {
  try {
    const text = localStorage.getItem(SCENE_PROFILE_STORAGE_KEY)
    if (!text || text.length > 2000000) {
      return emptyLibrary()
    }
    const value: unknown = JSON.parse(text)
    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      value.version !== 1 ||
      !("profiles" in value) ||
      !Array.isArray(value.profiles)
    ) {
      return emptyLibrary()
    }
    const profiles = value.profiles
      .filter(isSceneCalibrationProfile)
      .slice(0, MAX_PROFILES)
    let selectedId: string | null = null
    if (
      "selectedId" in value &&
      profiles.some((profile) => profile.id === value.selectedId)
    ) {
      selectedId = String(value.selectedId)
    }
    return { version: 1, selectedId, profiles }
  } catch {
    return emptyLibrary()
  }
}
function writeSceneProfiles(library: SceneProfileLibrary) {
  try {
    localStorage.setItem(SCENE_PROFILE_STORAGE_KEY, JSON.stringify(library))
  } catch {
    throw new Error(
      "Could not save on this device. Local storage is unavailable or full."
    )
  }
}
export function saveSceneProfile(
  name: string,
  data: SceneProfileCalibration,
  setup: SceneProfileSetup,
  id?: string
): SceneCalibrationProfile {
  const normalizedName = name.trim()
  if (!normalizedName || normalizedName.length > 60) {
    throw new Error("Enter a name of 1–60 characters.")
  }
  const library = readSceneProfiles()
  const existing = library.profiles.find((profile) => profile.id === id)
  if (id && !existing) {
    throw new Error("This profile was removed. Save a new profile.")
  }
  const nameChanged =
    !existing ||
    existing.name.trim().toLowerCase() !== normalizedName.toLowerCase()
  if (
    nameChanged &&
    library.profiles.some(
      (profile) =>
        profile.id !== id &&
        profile.name.trim().toLowerCase() === normalizedName.toLowerCase()
    )
  ) {
    throw new Error("That name already exists. Choose another name.")
  }
  if (!existing && library.profiles.length >= MAX_PROFILES) {
    throw new Error(
      "Remove an unused profile before adding another (20 maximum)."
    )
  }
  // Only mapping data and a representative point per hold are needed for reuse.
  // Camera frames, recordings and the original sample histories are not stored.
  const calibration = structuredClone(data.calibration)
  calibration.holds = calibration.holds.map((hold) => ({
    ...hold,
    pairs: hold.pairs.slice(0, 1).map((pair) => ({
      ...pair,
      feature: [...hold.feature],
      target: [...hold.target],
    })),
  }))
  const profile: SceneCalibrationProfile = {
    id: existing?.id ?? crypto.randomUUID(),
    name: normalizedName,
    updatedAt: new Date().toISOString(),
    calibration,
    method: data.method,
    offset: [...data.offset],
    delayMs: data.delayMs,
    unverified: data.unverified,
    setup: structuredClone(setup),
  }
  if (!isSceneCalibrationProfile(profile)) {
    throw new Error(
      "This calibration cannot be saved. Complete a valid mapping first."
    )
  }
  const profiles = library.profiles.filter((item) => item.id !== profile.id)
  profiles.push(profile)
  writeSceneProfiles({ version: 1, selectedId: profile.id, profiles })
  return profile
}
export function selectSceneProfile(id: string | null) {
  const library = readSceneProfiles()
  if (id !== null && !library.profiles.some((profile) => profile.id === id)) {
    throw new Error("This profile is no longer available.")
  }
  writeSceneProfiles({ ...library, selectedId: id })
}
export function deleteSceneProfile(id: string) {
  const library = readSceneProfiles()
  writeSceneProfiles({
    ...library,
    profiles: library.profiles.filter((profile) => profile.id !== id),
    selectedId: library.selectedId === id ? null : library.selectedId,
  })
}
export function sceneProfileSetupIssue(
  profile: SceneCalibrationProfile,
  setup: SceneProfileSetup
): string {
  if (profile.setup.trackerFormat !== setup.trackerFormat) {
    return "Select the same Manual or Auto eye tracker used for this profile."
  }
  if (
    JSON.stringify(profile.setup.orientation) !==
    JSON.stringify(setup.orientation)
  ) {
    return "Restore the camera rotation and mirror orientation used for this profile before loading it."
  }
  return ""
}
