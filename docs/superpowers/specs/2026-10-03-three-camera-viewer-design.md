# Three-camera viewer

Build a public browser-only viewer from v3 with independent Eye, Scene, and Auxiliary camera previews. This implements the camera-viewer scope accepted in chat: static on-screen selection, voice/typed commands, image orientation, and manual photo capture. No object detection, object tracking, cross-camera object matching, aiming output, actuator integration, or firing commands are included.

The user requested immediate inline implementation without further approval gates. Keep all new files in the separate Desktop worktree. Do not copy credentials or upload reference media.

## Architecture and UI

- `/trial/three-camera-viewer` loads a client-only workspace and is discoverable from the dashboard.
- Reuse `SceneCamera` and `CameraTransformControls`. Extend camera configuration to isolate viewer orientation preferences from existing eye/scene tracking and use accurate per-feed labels.
- Three source panels each support USB selection, network URLs via the existing relay, connect/disconnect, rotation in degrees, horizontal/vertical mirroring, and reset.
- A camera can be selected as the active preview. A clicked point is a static screen marker tied to the current source and orientation; it does not identify or follow an object. “Select” confirms a clicked point; it asks for a click when no current marker exists, “clear” removes it, “switch camera” cycles previews, and named camera commands change the active preview.
- “Take photo” saves a PNG of a fresh transformed frame from the active feed. No periodic or automatic capture is provided.
- Reuse existing dark tracker tokens and components. Stack previews on small screens; keep source controls and the command bar reachable.

## Privacy and lifecycle

- Camera connections require explicit Connect actions; no auto-start or persisted stream credentials.
- Camera frames, snapshots, typed commands, and transcripts are not posted to the backend.
- Voice uses browser on-device recognition only (`processLocally = true`). Missing support produces an actionable typed-command fallback. A local language pack may be downloaded only through a dedicated user action.
- Recognition is opt-in and stops on disposal, errors, page hiding, and disconnect-all. Only final results invoke exact whitelisted commands; unknown input has no effect.
- Prevent simultaneous USB connection races and duplicate use of one physical device across the three feeds.
- Disconnection, source changes, rotation, mirroring, and stale frames invalidate a visual marker. Stop tracks and subscriptions on unmount.
- Reject photo capture when frames are missing/stale or canvas encoding fails; report errors in the workspace.

## Verification

Test command parsing, stale/invalid selection handling, independent orientation persistence, duplicate USB exclusion, local-only voice behavior and lifecycle cancellation, and photo failures. Run the frontend test suite, lint, typecheck, and production build. Inspect the public route at desktop/mobile sizes and interact with commands and camera controls using synthetic input where practical. Physical cameras and microphone accuracy require hardware validation.
