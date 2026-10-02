# Scene calibration modes implementation plan

**Goal:** Keep hand calibration, fix unstable collection and corner retries, and add printed-marker and experimental one-point calibration in worktree-v4.

**Architecture:** All methods share timestamp pairing, stable holds, mapping, and independent validation. A worker detects a broad circular marker displayed between the eye and scene previews, with an optional printable copy. Nested ellipse geometry and local contrast supply the reference center. Preview masking and scale continuity prevent camera-feedback copies from replacing the target. One-point calibration reanchors a verified mapping or uses adjustable projection gains in the user's corrected views, accounting for the opposite horizontal perspective of the front-facing eye and outward-facing scene. Camera orientations remain setup metadata, with explicit estimated quality in preview and exports.

**Constraints:** Preserve both manual and automatic eye models; keep nine-point hand and marker coverage and five independent validation holds; do not fabricate validation passes; preserve loss/freshness checks; local processing; minimal UI; no commits or publishing.

## Tasks

- [x] Reproduce corner extrapolation and brief movement resets with real collector tests. Fix fitting diagnostics separately from independent accuracy, exclude jitter without counting missing samples, and show a saved hold at full progress.
- [x] Add pinned marker decoder, printable SVG, latest-frame worker lifecycle, perspective-correct center, and real-raster tests including mirror/rotation/ambiguity.
- [x] Add calibration method state, generic references, automatic stable marker holds, one free-target hold, and prior-mapping/projection estimation. Prove method switches, stale frames, fresh checks, and estimated quality with session tests.
- [x] Add compact three-option selection, marker download/instructions and outline, one-point gain controls, stable overall progress, and automatic live transition after successful checks or one-point capture. Preserve preview and failed-check diagnostics.
- [x] Include method/quality in recordings and CSV, and stop collection/recording when setup changes.
- [x] Run full Bun suite, lint, typecheck, build; exercise all methods in the browser fixture including real marker decode, save proof, and reload the idle user app.

## Review focus

Switching modes during capture; image mirroring and perspective; scene reconnect while marker worker is busy; holding a fixed target without scene coverage; one-point estimates mistaken for verified accuracy. Cover these with lifecycle/session/detector tests and an independent final review.

## Progress

Read-only investigation confirmed automatic worst-corner retries and reset-on-single-frame movement. Marker and collector tasks have separate file owners; integration stays with the main agent. No acceptance threshold changes to fresh validation are authorized or planned.

Independent review reproduced focused method-button Space being ignored, hidden one-point validation rings, and recording claiming checked accuracy after an offset changed. Regression checks and integration fixes cover all three. One-point estimates deliberately remain recordable without a fabricated validation pass. Physical camera accuracy remains unmeasured; browser smoke evidence uses labeled synthetic sensors and the real marker decoder.
