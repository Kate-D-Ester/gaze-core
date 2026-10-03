/** Static Tailwind primitives for calibration presentation. */

export const EyeCalibrationStyles = `
  fixed [inset:0] [z-index:80] [background:var(--background)]
  [color:var(--foreground)]
`

export const EyeFocusViewStyles = `
  fixed [inset:0] [z-index:80] [background:var(--background)]
  [color:var(--foreground)] [&_>_.eye-icon-button]:absolute [&_>_.eye-icon-button]:[right:25px] [&_>_.eye-icon-button]:[top:25px]
`

export const EyeCalibrationTopStyles = `
  flex justify-between items-center [padding:24px_30px]
  [font-size:10px] [letter-spacing:1px] [color:var(--muted-foreground)] [&_b]:[margin-left:20px]
  [&_b]:[font-weight:500] [&_b]:[letter-spacing:0] [&_button]:[padding:10px]
`

export const EyeCalibrationWelcomeStyles = `
  absolute [inset:80px_24px_36px] flex flex-col
  justify-center items-center [gap:16px] [padding-bottom:100px]
  text-center [&_h2]:[max-width:780px] [&_h2]:[font-size:clamp(26px,_3.8vw,_48px)] [&_h2]:[font-weight:600]
  [&_h2]:[letter-spacing:-1.3px] [&_h2]:[line-height:1.15] [&_p]:[max-width:660px] [&_p]:[font-size:15px]
  [&_p]:[line-height:1.5] [&_p]:[color:var(--muted-foreground)] [&_.eye-calibration-start]:absolute [&_.eye-calibration-start]:[bottom:20px]
  [&_.eye-calibration-start]:[min-width:240px] [&_.eye-calibration-start]:[min-height:52px] [&_.eye-calibration-start]:[color:white] [&_.eye-calibration-start]:[background:color-mix(in_srgb,_var(--primary)_40%,_#09241b)]
  [&_.eye-calibration-error]:[color:#edb2a8]
`

export const EyeCalibrationTargetStyles = `
  absolute [width:28px] [height:28px] [transform:translate(-50%,_-50%)]
  grid place-items-center
`

export const EyeCalibrationStimulusStyles = `
  [width:18px] [height:18px] grid place-items-center
  relative motion-reduce:[&.is-bursting]:animate-none motion-reduce:[&.is-bursting]:[opacity:0]
`

export const EyeCalibrationPillStyles = `
  absolute [height:10px] [width:16px] [border-radius:999px]
  [transition:background-color_80ms_linear]
`

export const EyeCalibrationFocalPointStyles = `
  absolute [width:3px] [height:3px] [background:#090909]
  [border-radius:50%]
`

export const EyeCalibrationFeedbackStyles = `
  [--eye-feedback-width:min(360px,_calc(100vw_-_24px))] [--eye-feedback-gap:22px] absolute [width:var(--eye-feedback-width)]
  text-center [font-size:12px] [line-height:1.4] [color:var(--muted-foreground)]
  pointer-events-none [@media(max-height:_500px)]:[--eye-feedback-width:min(420px,_calc(100vw_-_24px))] [@media(max-height:_500px)]:[--eye-feedback-gap:16px] [@media(max-height:_500px)]:[font-size:11px]
  [@media(max-height:_500px)]:[line-height:1.2]
`

export const EyeCalibrationCaptionStyles = `
  block [margin-bottom:4px] [color:var(--muted-foreground)] [font-size:10px]
  [line-height:1.2] [@media(max-height:_500px)]:hidden
`

export const EyeCalibrationGuidanceStyles = `
  flex items-center justify-center [gap:8px]
  [&_p]:[margin:0] [&_p:empty]:hidden
`

export const EyeCalibrationActionStyles = `
  fixed [pointer-events:auto] [&_button]:[min-width:44px] [&_button]:[min-height:44px]
`

export const EyeFocusCaptionStyles = `
  absolute [top:28px] [left:30px] [&_h2]:[font-size:25px]
  [&_h2]:[font-weight:450] [&_h2]:[margin:6px_0] [&_p]:[font-size:12px] [&_p]:[color:var(--muted-foreground)]
`
