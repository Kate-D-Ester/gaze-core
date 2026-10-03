# Viewer voice and gaze implementation plan

Goal: working local English commands, visible calibrated scene gaze, and commands accessible while scrolling.

Architecture: serve a pinned Vosk WASM worker and checksum-verified English model from the app. An AudioWorklet supplies microphone samples; the app owns cancellation and resource cleanup. Subscribe the viewer to its existing SceneSession and reuse GazeBubbleOverlay. Keep the command bar sticky in the existing scroll area.

Constraints: keep all work in this isolated Desktop worktree; use Bun; preserve v3 eye tracking math; no audio uploads, target acquisition, hardware control, or firing. Keep advanced help collapsed and use existing controls/styles.

- [x] Voice: replace browser pack installation; test cancellation, permission/model failures, final command filtering and cleanup; prepare same-origin assets with pinned checksum; verify real WASM against generated speech.
- [x] Gaze: share SceneSession, reuse its calibration and freshness gates; test valid/invalid/stale measurements and setup round-trip continuity. Scene gaze stays visual and independent of manual selection.
- [x] Commands: pin compact command controls; test interactions at wide and narrow sizes, scroll retention, keyboard access and expanded help.
- [x] Finish: full tests, lint, typecheck, build, dependency audit, independent code review; restart the isolated preview and inspect with disconnected or synthetic feeds.

Review focus: stopping during model or microphone loading; missing assets and denied microphone; stale gaze after source changes; short mobile viewports and expanded help; repeated voice results and unsupported phrases.

Verification: 726 full-suite tests passed; 36 viewer tests passed after the final viewport fix. Lint, typecheck, production build and dependency audit passed. Independent review has no remaining Critical/Important findings. Generated English speech was recognized through the actual AudioWorklet/WASM path at 44100 Hz. UI checks covered 1280×900, 390×844 and 390×449; scrolling, expanded help and keyboard focus keep commands visible; stale synthetic eye data hides gaze. Physical microphone recognition accuracy remains a user-device check.
