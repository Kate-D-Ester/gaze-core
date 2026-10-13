# Target bot following implementation plan

> For agentic workers: execute inline with test-driven-development; retain this plan as the progress record.

**Goal:** Publish Zero-compatible MQTT movement from fresh, verified Target tracking boxes.

**Architecture:** A pure servo planner, a signed guest MQTT session, and a follower scheduler. React adds compact controls to the existing toolbar; vision models are unchanged.

**Tech stack:** TypeScript, React, Bun, MQTT.js 5.14.1, browser WebCrypto.

**Spec:** ../specs/2026-10-14-target-bot-following-design.md

## Global constraints

- Existing `codex/three-camera-viewer` worktree; preserve other project files.
- No hardware movement during tests. QoS 0, retain false, no offline queue.
- Target observation/frame freshness 500 ms; publish renewal 250 ms; checks 50 ms.
- Guest challenge enrollment, signed commands and boot/epoch ownership from Zero's current protocol.
- Fixed car camera; no vertical commands; width 30%, speed 25%, center hysteresis 8%/4%, width 3%/1.5%.

## Review focus

- Stop while signing/publishing is pending must cancel subsequent movement.
- Retained/rebooted/offline status must never grant fresh authority.
- A fresh camera frame must not make an older inference box fresh.
- Reselecting or reorienting must disable following, not change the tracked object silently.
- Mirroring and clipped targets must not reverse controls or cause forward motion.

## Task 1: Signed guest MQTT session

Files: `features/robot-control/zero-protocol.ts`, `zero-session.ts`, `robot-control.types.ts`; tests under `frontend/tests/robot-control`.

- [x] Write and run failing tests for P-256 firmware wire format, challenge join, retained status, ownership and motion cancellation.
- [x] Implement the compatible guest-only session and pin MQTT.js in the web app.
- [x] Run session/protocol tests; confirm stale and offline commands cannot publish.

## Task 2: Visual servo and follower

Files: `visual-servo.ts`, `target-follower.ts`; tests for pure planner and real tracking/fake MQTT integration.
Interfaces: `VisualServo.decide(box, transform) -> Movement | null`; `TargetFollower.enable(settings)`, `tick()`, `disable()`; session `move(action,cmd,speed,guard)`, `stop()`, `cancelMotion()`.

- [x] Run failing direction, hysteresis, clipping and mirror cases.
- [x] Implement horizontal-first/width decisions and freshness/identity guards.
- [x] Run loss/reacquisition, cadence, clear, authority change and delayed-publication tests.

## Task 3: Viewer controls and full verification

Files: `bot-controls.tsx`, `use-bot-control.ts`, existing viewer workspace/toolbar types and components, `docs/three-camera-viewer.md`.

- [x] Run failing UI integration tests for connect/access/follow/stop and blur/visibility lifecycle.
- [x] Implement compact settings and keep Follow/Stop in the sticky toolbar.
- [x] Run frontend tests, typecheck, lint, build and vision regressions.
- [x] Render desktop/narrow states and review the final diff; document hardware limitations.

## Progress

- Reused the existing isolated branch; reference controller and main v3 checkout remain unmodified.
- Signed protocol and follower tests: 33 passed.
- Review fixed opposite-direction hysteresis, graceful signed leave, pre-enable evidence, and a Scene-source publication guard.
- Typecheck and full lint passed; old generated `.next*` preview outputs are now excluded from lint.
- Vision regression suite: 168 passed (one upstream PyTorch deprecation warning).
- Final frontend suite: 811 passed. Production build passed in `.next-bot-preview`.
- Browser inspection: HTTP 200, no page errors or horizontal overflow at 1280px/390px, Follow disabled before access, Stop visible with settings expanded.
- Local viewer is running on port 4016; vision status is ready on MPS. No physical broker or motor commands were tested.
