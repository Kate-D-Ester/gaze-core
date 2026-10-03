import { Check, Plus, Save, Trash2, X } from "lucide-react"
import { useState } from "react"
import { HelpTip } from "../eye-tracking/components/help-tip"
import {
  EyeActionIconStyles,
  EyeButtonStyles,
  EyeGuidanceRowStyles,
  EyeMutedStyles,
} from "../tracking-ui/control-styles"
import {
  SceneProfileControlsStyles,
  SceneProfileRowStyles,
} from "../tracking-ui/scene-styles"
import type {
  CalibrationProfileControlsProps,
  ProfileNameDraft,
} from "./calibration-profile-controls.types"
export function CalibrationProfileControls({
  controller,
}: CalibrationProfileControlsProps) {
  const [draft, setDraft] = useState<ProfileNameDraft | null>(null)
  const selected = controller.profiles.find(
    (profile) => profile.id === controller.selectedId
  )
  function startSave(createNew: boolean) {
    let name = ""
    if (!createNew && selected) {
      name = selected.name
    }
    setDraft({ name, createNew })
  }
  return (
    <section
      className={`scene-profile-controls ${SceneProfileControlsStyles}`}
      aria-label="Saved scene calibrations"
    >
      <div className={`eye-guidance-row ${EyeGuidanceRowStyles}`}>
        <span>Calibration profile</span>
        <HelpTip
          label="Calibration profile help"
          text="Save a completed mapping even if its accuracy check has not passed. Unverified profiles stay unverified when loaded. Profiles and X/Y adjustments stay in this browser. The last selected profile loads after camera setup. Changed camera angle or fit may need recalibration."
        />
      </div>
      <div className={`scene-profile-row ${SceneProfileRowStyles}`}>
        <select
          aria-label="Scene calibration profile"
          value={controller.selectedId ?? ""}
          disabled={!controller.canLoad || controller.profiles.length === 0}
          onChange={(event) => controller.load(event.target.value)}
        >
          <option value="" disabled>
            Choose profile
          </option>
          {controller.profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`eye-button ${EyeButtonStyles} secondary eye-action-icon ${EyeActionIconStyles}`}
          aria-label="Save calibration profile"
          data-tooltip="Save profile"
          disabled={!controller.canSave}
          onClick={() => startSave(false)}
        >
          <Save size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`eye-button ${EyeButtonStyles} secondary eye-action-icon ${EyeActionIconStyles}`}
          aria-label="Save as new calibration profile"
          data-tooltip="Save as new"
          disabled={!controller.canSave}
          onClick={() => startSave(true)}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`eye-button ${EyeButtonStyles} secondary eye-action-icon ${EyeActionIconStyles}`}
          aria-label="Delete calibration profile"
          data-tooltip="Delete profile"
          disabled={!selected || controller.disabled}
          onClick={() => {
            if (
              selected &&
              window.confirm(`Delete “${selected.name}” from this browser?`)
            ) {
              controller.remove()
            }
          }}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
      {draft && (
        <form
          className={`scene-profile-row ${SceneProfileRowStyles}`}
          onSubmit={(event) => {
            event.preventDefault()
            if (controller.save(draft.name, draft.createNew)) {
              setDraft(null)
            }
          }}
        >
          <input
            autoFocus
            aria-label="Calibration profile name"
            placeholder="Name"
            maxLength={60}
            value={draft.name}
            disabled={controller.disabled}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
          <button
            type="submit"
            className={`eye-button ${EyeButtonStyles} primary eye-action-icon ${EyeActionIconStyles}`}
            aria-label="Confirm profile name"
            data-tooltip="Save"
            disabled={!controller.canSave || !draft.name.trim()}
          >
            <Check size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`eye-button ${EyeButtonStyles} secondary eye-action-icon ${EyeActionIconStyles}`}
            aria-label="Cancel profile name"
            data-tooltip="Cancel"
            onClick={() => setDraft(null)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </form>
      )}
      {controller.error && (
        <p className="eye-error" role="alert">
          {controller.error}
        </p>
      )}
      {!controller.error && controller.message && (
        <small className={`eye-muted ${EyeMutedStyles}`} role="status">
          {controller.message}
        </small>
      )}
    </section>
  )
}
