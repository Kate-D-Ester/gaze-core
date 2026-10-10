/** Static Tailwind primitives for remote presentation. */

export const RemoteTrialLinkStyles = `
  [color:var(--primary)] [font-size:12px] [text-decoration:none] [min-height:44px]
  inline-flex items-center
`

export const RemoteAppStyles = `
  h-auto [min-height:100svh] overflow-auto [&_.eye-header]:[min-height:56px]
`

export const RemoteContentStyles = `
  [width:min(1120px,_100%)] [margin:0_auto] [padding:28px_32px_40px] max-[700px]:[padding:20px_18px_30px]
`

export const RemoteTitleStyles = `
  flex items-center [gap:12px] justify-between
  [margin-bottom:24px] [&_h1]:[margin:0] [&_h1]:[font-size:23px] [&_h1]:[font-weight:550]
  [&_h1]:[letter-spacing:-0.6px] max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:[gap:18px]
  max-[700px]:[&_h1]:[font-size:21px]
`

export const RemotePageHeadingStyles = `
  flex items-center [gap:12px] [&_.remote-tooltip]:[left:0]
  [&_.remote-tooltip]:[transform:none]
`

export const RemoteHeaderToolsStyles = `
  flex items-center [gap:10px] [&_.remote-tooltip]:[top:calc(100%_+_8px)]
  [&_.remote-tooltip]:[bottom:auto] [&_.remote-tooltip]:[right:0] [&_.remote-tooltip]:[left:auto] [&_.remote-tooltip]:[transform:none]
`

export const RemoteStepsStyles = `
  flex items-center [gap:12px] [list-style:none]
  [padding:0] [margin:0] [&_li]:[color:#686d69] [&_.remote-hint]:[width:40px]
  [&_.remote-hint]:[height:40px] [&_.remote-hint]:justify-center [&_li.active]:[color:var(--primary)] [&_li.active_button]:[color:var(--primary)] [&_li[aria-current]]:[border-bottom:2px_solid_var(--primary)]
  max-[700px]:justify-between max-[700px]:[gap:6px] max-[700px]:[&_li:first-child_.remote-tooltip]:[left:0] max-[700px]:[&_li:first-child_.remote-tooltip]:[transform:none]
  max-[700px]:[&_li:last-child_.remote-tooltip]:[left:auto] max-[700px]:[&_li:last-child_.remote-tooltip]:[right:0] max-[700px]:[&_li:last-child_.remote-tooltip]:[transform:none]
`

export const RemotePickerStyles = `
  [min-height:360px] flex flex-col items-center
  justify-center [gap:22px] [&_>_p]:[margin:0] [&_>_p]:[font-size:13px]
  [&_>_p]:[color:var(--dim)] max-[700px]:min-h-0 max-[700px]:items-stretch max-[700px]:[padding:12px_0]
  max-[700px]:[gap:16px] max-[700px]:[&_>_p]:text-center
`

export const RemoteCardsStyles = `
  [width:min(690px,_100%)] grid [grid-template-columns:repeat(3,_1fr)] [gap:14px]
  max-[700px]:[grid-template-columns:1fr] max-[700px]:[gap:10px]
`

export const RemoteModeCardStyles = `
  relative flex flex-col items-center
  justify-center [gap:20px] [height:174px] [color:var(--primary)]
  [background:var(--card)] [border:1px_solid_var(--line)] [border-radius:8px] [transition:border-color_0.15s]
  [&_h2]:[margin:0] [&_h2]:[color:var(--ink)] [&_h2]:[font-size:14px] [&_h2]:[font-weight:500]
  [&:hover]:[border-color:var(--primary)] [&:focus-visible]:[border-color:var(--primary)] [&:hover_>_.remote-tooltip]:[visibility:visible] [&:hover_>_.remote-tooltip]:[opacity:1]
  [&:focus-visible_>_.remote-tooltip]:[visibility:visible] [&:focus-visible_>_.remote-tooltip]:[opacity:1] max-[700px]:[height:96px] max-[700px]:flex-row
  max-[700px]:[justify-content:start] max-[700px]:[gap:20px] max-[700px]:[padding:0_24px] max-[700px]:[&_>_.remote-tooltip]:[bottom:auto]
  max-[700px]:[&_>_.remote-tooltip]:[top:calc(100%_+_8px)] motion-reduce:[transition:none]
`

export const RemoteIconButtonStyles = `
  relative inline-flex items-center justify-center
  [flex-shrink:0] [width:44px] [height:44px] [padding:0]
  [border:1px_solid_transparent] [border-radius:6px] [background:transparent] [color:var(--dim)]
  [text-decoration:none] cursor-pointer [&:hover]:[color:var(--ink)] [&:hover]:[background:var(--secondary)]
  [&[aria-pressed="true"]]:[color:var(--ink)] [&[aria-pressed="true"]]:[background:var(--secondary)] [&.primary]:[color:var(--primary-foreground)] [&.primary]:[background:var(--primary)]
  [&:hover_>_.remote-tooltip]:[visibility:visible] [&:hover_>_.remote-tooltip]:[opacity:1] [&:focus-visible_>_.remote-tooltip]:[visibility:visible] [&:focus-visible_>_.remote-tooltip]:[opacity:1]
`

export const RemoteHintStyles = `
  relative inline-flex items-center [gap:8px]
  [color:inherit] [outline-offset:3px] [&:focus-visible]:[outline:2px_solid_var(--primary)] [&:hover_>_.remote-tooltip]:[visibility:visible]
  [&:hover_>_.remote-tooltip]:[opacity:1] [&:focus-visible_>_.remote-tooltip]:[visibility:visible] [&:focus-visible_>_.remote-tooltip]:[opacity:1]
`

export const RemoteTooltipStyles = `
  absolute [z-index:120] [bottom:calc(100%_+_8px)] [left:50%]
  [transform:translateX(-50%)] [width:max-content] [max-width:220px] [padding:7px_10px]
  [border:1px_solid_#414742] [border-radius:5px] [background:#242a25] [color:var(--ink)]
  [font-size:11px] [font-weight:400] [line-height:1.5] text-center
  [visibility:hidden] [opacity:0] pointer-events-none
`

export const RemoteBottomActionsStyles = `
  [&_>_:first-child_.remote-tooltip]:[left:0] [&_>_:first-child_.remote-tooltip]:[transform:none] flex justify-between
  [padding-top:12px] [margin-top:24px] [border-top:1px_solid_var(--line)]
`

export const RemoteHelpStyles = `
  relative [&_summary]:[list-style:none] [&_summary::-webkit-details-marker]:hidden [&_a]:[color:var(--primary)]
`

export const RemoteHelpBodyStyles = `
  absolute [z-index:130] [top:calc(100%_+_8px)] [right:0]
  [width:min(320px,_calc(100vw_-_32px))] [padding:18px] [border:1px_solid_var(--line)] [background:#171b18]
  [border-radius:8px] [box-shadow:0_8px_30px_#0007] [color:var(--dim)] [font-size:12px]
  [line-height:1.65] [&_strong]:[color:var(--ink)] [&_strong]:[font-weight:500] [&_p]:[margin:12px_0]
`

export const RemoteHelpLinksStyles = `
  flex [gap:16px]
`

export const RemoteSetupHeadingStyles = `
  flex items-center justify-between [margin:0_0_12px]
  [&_>_span]:flex [&_>_span]:items-center [&_>_span]:[gap:8px] [&_>_span]:[font-size:13px]
  [&_>_span]:[color:var(--dim)]
`

export const RemoteWorkspaceStyles = `
  grid [grid-template-columns:minmax(0,_1.6fr)_minmax(0,_1fr)] [gap:32px] [align-items:start]
  [&[hidden]]:hidden max-[700px]:[grid-template-columns:1fr] max-[700px]:[gap:20px]
`

export const RemoteCameraPanelStyles = `
  [background:var(--card)] [border:1px_solid_var(--line)] [border-radius:8px]
`

export const RemotePanelTitleStyles = `
  flex items-center justify-between [padding:10px_14px]
  [border-bottom:1px_solid_var(--line)] [color:var(--dim)] [&_.remote-tooltip]:[top:calc(100%_+_8px)] [&_.remote-tooltip]:[bottom:auto]
  [&_.remote-tooltip]:[left:0] [&_.remote-tooltip]:[transform:none]
`

export const RemoteCameraStatusStyles = `
  flex [gap:7px] items-center [font-size:11px]
  [text-transform:capitalize]
`

export const RemotePreviewStyles = `
  relative w-full [background:#070807] overflow-hidden
  [&_video]:block [&_video]:w-full [&_video]:h-full [&_video]:object-contain
  [&.mirrored_video]:[transform:scaleX(-1)] [&.mirrored_.remote-preview-overlay]:[transform:scaleX(-1)] [&.selecting]:cursor-crosshair [&.selecting]:[touch-action:none]
  [&.selecting]:[outline:2px_solid_var(--primary)] [&.selecting]:[outline-offset:-2px]
`

export const RemotePreviewOverlayStyles = `
  absolute [inset:0] w-full h-full
  pointer-events-none
`

export const RemotePreviewPlaceholderStyles = `
  absolute [inset:0] flex flex-col
  items-center justify-center [gap:12px] [color:#747b76]
  [font-size:12px]
`

export const RemotePreviewFooterStyles = `
  flex items-center justify-between [padding:11px_14px]
  [border-bottom:1px_solid_var(--line)] [font-size:11px] [color:var(--dim)] [&_.remote-tooltip]:[left:0]
  [&_.remote-tooltip]:[transform:none]
`

export const RemoteGoodStyles = `
  [color:var(--primary)]
`

export const RemoteMutedStyles = `
  [color:var(--dim)] [font-size:12px]
`

export const RemoteHeadPanelStyles = `
  flex items-center [gap:20px] [padding:14px]
  [color:var(--dim)] [&_>_.remote-hint_.remote-tooltip]:[left:0] [&_>_.remote-hint_.remote-tooltip]:[transform:none] max-[700px]:[gap:14px]
`

export const RemoteHeadReadoutStyles = `
  flex [flex:1] justify-between [gap:12px]
  [&_strong]:[color:var(--ink)] [&_strong]:[font-weight:450] [&_strong]:[font-size:16px] [&_strong]:tabular-nums
  max-[700px]:[gap:8px] max-[700px]:[&_strong]:[font-size:15px] max-[700px]:[&_.remote-hint:last-child_.remote-tooltip]:[left:auto] max-[700px]:[&_.remote-hint:last-child_.remote-tooltip]:[right:0]
  max-[700px]:[&_.remote-hint:last-child_.remote-tooltip]:[transform:none]
`

export const RemoteControlsStyles = `
  [padding:14px_0] [&_.remote-tooltip]:[left:0] [&_.remote-tooltip]:[transform:none] [&_h2]:[margin:0_0_8px]
  [&_h2]:[font-size:20px] [&_h2]:[font-weight:550] [&_h2]:[letter-spacing:-0.4px] [&_>_p]:[margin:0_0_20px]
  [&_>_p]:[font-size:12px] [&_>_p]:[color:var(--dim)] [&_>_p]:[line-height:1.6] max-[700px]:[padding:0]
`

export const RemoteMetricsStyles = `
  [&_>_:last-child_.remote-tooltip]:[left:auto] [&_>_:last-child_.remote-tooltip]:[right:0] grid [grid-template-columns:repeat(3,_1fr)]
  [gap:16px] [margin:24px_0_18px] [&_>_.remote-hint]:flex [&_>_.remote-hint]:flex-col
  [&_>_.remote-hint]:[align-items:start] [&_>_.remote-hint]:[gap:4px] [&_strong]:[color:var(--primary)] [&_strong]:[font-weight:500]
  [&_strong]:[font-size:29px] [&_strong]:[letter-spacing:-0.8px] [&_small]:[font-size:11px] [&_small]:[color:var(--dim)]
  [&_.remote-hint_>_span:not(.remote-tooltip)]:[font-size:11px] [&_.remote-hint_>_span:not(.remote-tooltip)]:[color:var(--dim)]
`

export const RemoteActionsStyles = `
  flex items-center [gap:10px] [margin:20px_0_6px]
  [&_>_.remote-hint]:[color:var(--dim)] [&_>_.remote-hint]:[font-size:12px] [&_>_.remote-hint]:[margin-right:6px]
`

export const RemoteFieldStyles = `
  flex flex-col [gap:8px] [font-size:12px]
  [margin:18px_0] [color:var(--dim)] [&_select]:w-full [&_select]:[padding:10px]
  [&_select]:[min-height:44px] [&_select]:[color:var(--ink)] [&_select]:[background:var(--card)] [&_select]:[border:1px_solid_var(--line)]
  [&_select]:[border-radius:6px] [&_input[type="range"]]:w-full [&_input[type="range"]]:[min-height:36px] [&_input[type="range"]]:[accent-color:var(--primary)]
`

export const RemoteFieldLabelStyles = `
  flex items-center [gap:8px] [&_>_span]:[margin-left:auto]
`

export const RemoteCheckboxStyles = `
  flex items-center [gap:10px] [margin:22px_0]
  [color:var(--dim)] [font-size:12px] cursor-pointer [&_input]:[width:18px]
  [&_input]:[height:18px] [&_input]:[accent-color:var(--primary)]
`

export const RemoteCheckStyles = `
  flex items-center [gap:8px] [margin:20px_0]
  [font-size:12px] [color:var(--dim)]
`

export const RemoteLiveStatusStyles = `
  flex items-center [gap:8px] [margin:20px_0]
  [font-size:12px] [color:var(--dim)]
`

export const RemoteAlertStyles = `
  [padding:12px] [border-left:2px_solid_#9e8948] [background:#28261b] [color:#eadba3]
  [font-size:12px] [line-height:1.6] [margin-bottom:16px] [&.error]:[border-color:#b76458]
  [&.error]:[background:#2b1b1b] [&.error]:[color:#f0b5ad]
`

export const RemoteSummaryStyles = `
  flex [gap:22px] [margin:22px_0] [color:var(--dim)]
  [font-size:13px]
`

export const RemoteDetailsStyles = `
  [border-top:1px_solid_var(--line)] [padding-top:12px] [margin-top:20px] [font-size:11px]
  [color:var(--dim)] [&_summary]:flex [&_summary]:[gap:8px] [&_summary]:items-center
  [&_summary]:[min-height:44px] [&_summary]:cursor-pointer
`

export const RemoteSpinStyles = `
  animate-spin motion-reduce:animate-none
`

export const RemoteCalibrationStyles = `
  fixed [z-index:100] [inset:0] [background:#090b09]
  [color:#f4f4f2]
`

export const RemoteCalibrationTopStyles = `
  absolute [top:12px] [left:18px] [right:18px]
  flex justify-between items-center [font-size:12px]
  [color:#a3a6a3]
`
