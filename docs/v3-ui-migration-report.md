# V3 tracking UI migration

Screen, scene, and remote tracking presentations now use static Tailwind utilities. Shared named primitives in the eight purpose modules under `frontend/apps/web/src/features/tracking-ui/` cover panels, buttons, tooltips, camera orientation controls, ROI handles, calibration overlays, and responsive layouts. They are exported class strings with no runtime class-to-style lookup. Existing class names remain DOM/test hooks and have no stylesheet rules.

Deleted `v2.css`, `remote-eye-tracking.css`, `scene.css`, and `gaze-offset-controls.css`, including their imports. Shared globals now contains only imports and Tailwind source/variant/theme configuration. The tracking dark background and sea-green palette are preserved. The application retains its original light/dark semantic theme through static root variable utilities in `theme-styles.ts`, applied by the Next root layout. Computed canvas dimensions, ROI/gaze positions, threshold progress, marker scale, and calibration color remain runtime values.

The calibration pill rotates with accepted-frame progress and changes color. Its 260 ms burst uses Web Animations, respects reduced motion, cancels on target changes, and handles expected cancellation rejection. Spinners use Tailwind animation. Both tracking screens use `next/link` with `href`.

Validation: Tailwind 4.3.3 accepted all 1,343 unique utility candidates and compiled the stylesheet. A component run passed 56 tests across eight files; the follow-up calibration/scene suite passed all 24 tests across four files, including viewport gaze coordinate assertions. Actual Next app typecheck and lint both pass. Static V2 background/color-scheme, replay pointer-event control, and calibration action translations also use Tailwind utilities. The final V2 shell and calibration suite passed 20/20 tests.

Browser visual review was attempted against the running production preview at localhost:4001. CUA reported no available browsers; native-app inventory reported the Mac is locked and automatic unlock failed. Screenshots therefore remain unverified. Integration still needs mobile scene-marker placement, container breakpoints, focus/hover tooltips, and calibration capture with real cameras.

## Workspace structure

The former `v2-page` screen is now `eye-tracking-workspace`, exported as `EyeTrackingWorkspace`, with matching props/types. Setup navigation and panel components use `setup-step-*` names. Application imports, dynamic loading, and test imports were updated together. Existing DOM hooks and route redirects remain stable.

Remote presentation is split into mode selection, setup progress/configuration, video/eye-overlay preview, head readout, validation summary, and calibrated head-range components under `features/remote-eye-tracking/components`. Each component has matching props types. Formatting helpers and camera-mode configuration are shared explicitly. Tracker state, ROI selection callbacks, calibration/validation lifecycle, and exports stay in the screen. Both screen and remote trackers use the same `TrackingBrand` component.

After these changes, app lint/typecheck pass and the focused shell/setup/route/marker/remote-overlay suite passes 22 tests across five files.

## Parent integration verification

The parent browser runtime was available and verified desktop screen/remote layouts, remote Back behavior, scene synthetic calibration and real hand-worker initialization. The calibration status box stayed 58.5px high across normal and interrupted text. Mobile viewport emulation was not effective in this environment; no mobile screenshot validation is claimed. See the integrated audit for the final result, which supersedes the earlier subagent browser limitation.
