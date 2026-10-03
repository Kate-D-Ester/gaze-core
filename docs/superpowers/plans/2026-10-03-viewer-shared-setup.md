# Shared viewer setup

Keep the v3 tracker and calibration implementation as the single source of truth. v3 4458a3c merged at 8b95543; baseline 705 tests pass.

1. Give the viewer structural camera access and a small adapter for the existing eye tracker. Preserve transformed frames, source identity, and stale-frame checks; never create a second eye stream or worker.
2. Keep setup and viewer mounted in one workspace. Share the eye controller and scene camera, retain the live calibration session, and switch visible views with Gaze setup / Use in viewer. Pause hidden setup shortcuts and reference inference. Suspend viewer speech during setup.
3. Reuse eye/scene source preferences and orientation, show compact calibration status, and keep connection explicit. Saved preferences/profile are durable; rebuild the fitted auto model after reload. Preserve v3 readiness and profile checks.
4. Test identity/invalidation and the real setup/view switch, run frontend checks, review, and restart only this worktree preview.

Scope stays camera viewing and eye-tracker setup/status. Selections stay manual; no target matching, aiming outputs, hardware control, or firing.
