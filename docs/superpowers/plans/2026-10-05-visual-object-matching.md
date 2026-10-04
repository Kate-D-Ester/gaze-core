# Visual object matching implementation

Spec: ../specs/2026-10-05-visual-object-matching-design.md

Execute inline in the existing codex/three-camera-viewer worktree under Kate's autonomous implementation authorization.

## Task 1: Local inference boundary

Files: vision/pyproject.toml, assets.json, prepare.py, matching.py, engine.py, service.py, test/test_matching.py, test/test_service.py.

Interfaces: normalized Box = tuple[float,float,float,float] with x1,y1,x2,y2. select(image, point | box) returns an opaque selection token, box and label. match(token,image) returns status searching/matched/ambiguous and an optional box/score. Only match scores >0.80 with >=8 geometric inliers are accepted. Ambiguity margin 0.08. Sessions expire after 600 seconds and are capped at four. HTTP POST body cap 2 MiB, decoded images cap 1280 pixels per edge, 2 MP, JPEG only. Service requires a generated bearer secret, binds 127.0.0.1 on an ephemeral port, and does not expose files/URLs. Model preparation uses official pinned asset URLs and SHA256 manifest. Models/settings/cache stay ignored under this project.

RED: transformed textured reference matches; blank/different reference does not; score .80 rejected, .81 accepted; similar candidates ambiguous; invalid geometry rejected. Invalid JSON/image/box/request size/auth rejected; expired session rejected. GREEN: implement corresponding units. Verify uv run pytest and ruff check.

## Task 2: Same-origin bridge and lifecycle

Files: frontend/apps/web/src/app/api/viewer-vision/route.ts, frontend/apps/web/scripts/dev.ts, frontend/tests/tooling/viewer-vision.test.ts.

Interfaces: route forwards status/select/match/clear only to launcher-provided loopback URL with server-only secret. Same-origin browser requests and bounded bodies; no arbitrary URLs. Launcher starts its owned Python service, passes URL/secret to Next, cleans up only owned processes, and remains usable with a visible setup error if dependencies/models are unavailable. RED: cross-origin/oversized requests rejected, controlled URL and secret forwarded, owned launcher args preserved. GREEN: bridge and launcher. Verify bun test tests/tooling.

## Task 3: Matching controller and overlay

Files: frontend/apps/web/src/features/camera-viewer/object-tracking[.types].ts, use-object-tracking.ts, object-overlay.tsx, camera-preview[.types].tsx, camera-panel[.types].tsx, viewer-workspace.tsx, command-bar.tsx. Remove simulated cosplay HUD.

Interfaces: controller select(Scene camera, point | box), clear(), tick(Aux camera), getSnapshot()/subscribe. State includes label/status/error and result source key/generation/frame timestamp. One request in flight; selection revision invalidates old work; source/transform generations and freshness control overlay. Controller independently retains the reference across same-source frame gaps. Preview drag >8 CSS px selects a normalized rectangle and suppresses trailing click; keyboard/manual points retained. Select on Scene starts matching; Auxiliary displays searching/matched/ambiguous at fresh returned geometry. RED: late selection after clear, stale match after new selection, cancellation, no concurrent requests, outage/recovery and source switch; real DOM box coordinates and statuses; no eye dependency. GREEN: implement and integrate. Verify camera-viewer tests.

## Task 4: Real inference and finish

Files: vision/smoke.py, docs/three-camera-viewer.md; safe public fixture browser smoke.

Prepare pinned models, run real positive/negative transformed public-image smoke, measure actual latency. Fix substantive failures before claiming matching. Run all frontend tests, lint, typecheck, production build, browser layout/overlay and hidden/clear behavior using public fixtures. Fresh reviewer checks token lifecycle, input boundaries, confidence semantics, freshness, and privacy. Keep server running on 4014; don't restart Kate's other services or reload her camera session. Commit final implementation only after verification.

## Review Focus

Changed viewpoints and low-texture glasses can legitimately fail corroboration. Do not weaken the 80% threshold or claim calibrated identity probability to make a demo pass. Neither a detector category nor a manually positioned reticle proves an instance match. Validate real inference separately from UI fixtures. No eye-frame uploads, URLs, persistence, or hardware output. Concurrent Clear/Select/source changes must never resurrect a stale overlay.

## Execution outcome

Tasks 1–4 are implemented. Verification: 769 full-suite frontend tests, then 21 focused tracking/bridge/workspace tests after the final status wording; 12 Python tests; lint, typecheck, Ruff and production build. Real MPS smoke rejects blank/different samples and matches rotated/scaled public views. Browser checks confirmed no-Eye matching, custom rectangles, loss/reacquisition, Clear, real offline generated speech and pinned controls without 390px horizontal overflow. Review findings have regression coverage.

Automatic approval review blocked restarting the existing live viewer on 4014. Its process remains running. A separate build directory and port 4016 provide the verified final preview; restarting 4014 awaits explicit approval. The current local v3 commit f35c54b is already an ancestor. No merge into v3 or remote publication was performed.
