# Direct MQTT following implementation plan

> Execute inline with test-driven-development. The user authorized implementation without repeated permission questions.

**Goal:** Follow publishes the existing Zero car format using the local environment broker and exact command topic.
**Architecture:** Retain visual servo/follower boundaries; replace unsupported signed guest adapter with direct MQTT and simplify existing controls.
**Tech stack:** TypeScript, React, Bun, existing MQTT.js.
**Spec:** ../specs/2026-10-14-target-bot-following-design.md

## Constraints and review focus

- No UI broker fields, admin profile/key import, request-control step, or hardware test motion. Local .env uses only existing Zero broker fields.
- Stop cancels queued commands; transport errors/disconnect/reconnect require explicit Follow again.
- Offline QoS 0 must not be buffered; exact user topic must receive F/B/L/R/S JSON.
- Preserve tracking identity/confidence/freshness; approximate centering uses hysteresis.
- Credentials remain in memory; existing sticky controls stay compact.

## Task 1: Direct MQTT session

Files: robot-control/zero-session.ts, robot-control.types.ts; tests/robot-control/fixtures.ts and zero-session.test.ts.
- [x] Write failing tests for literal Zero payload on user topic, connection readiness without telemetry, stop cancellation, errors/reconnect and invalid configuration.
- [x] Replace signed adapter; remove unused signing/queue code. Run focused tests.

## Task 2: Approximate center and controls

Files: visual-servo.ts, target-follower.ts, bot-controls.tsx; tests/robot-control/*.test.ts(x).
- [x] Write failing stable centering and Connect → Follow → Stop tests without access enrollment.
- [x] Keep center hysteresis; keep holding state stable. Remove access and broker fields. Connect loads the same-origin local configuration route; cancel pending configuration loads on teardown.
- [x] Verify real tracking → MQTT publication, stale/lost stop and reacquisition.

## Task 3: Verification and local preview

- [x] Independent review of changed code; resolve substantive findings.
- [x] Full frontend tests, lint, typecheck and production build; update viewer documentation.
- [x] Restart existing isolated viewer on port 4016. Confirm endpoint and browser controls.

## Progress

2026-10-14: Reference source confirms raw car commands on alice/zero/car/command; previous signed /control adapter did not match firmware. Latest user scope replaces queue/auth flow with direct user-configured MQTT. No controller profile will be imported.

Latest user correction: read MQTT settings from local environment instead of asking for them in the viewer. Added local-only no-store configuration route, Connect/Disconnect button and canceled configuration loads on unmount. Follow settings only contain maximum turn speed. Local configuration was seeded without printing credentials or importing admin material.

Final verification: 848 frontend tests passed, full lint and typecheck passed, production build passed. Independent review findings were reproduced and fixed. Local configuration serves no-store only to same-origin loopback requests using the browser Host; .env.local remains ignored. Browser Connect reached MQTT connected without broker fields. Real isolated MQTT tests verified all directions, stable hold and loss/reacquisition; no physical driving was performed.

Latest steering: turn-only L/R/S with timestamped adaptive turn speed; removed forward/backward from both planner and adapter and removed width UI. Forty-one focused tests pass, including real MQTT variable-speed packets, loss/reacquisition and centered size changes without F/B. Final full verification is being rerun for this steering.

Turn-only final verification: 842 frontend tests passed, lint passed, and production build including TypeScript passed. Independent review found no remaining substantive issues. Only L/R/S is accepted at the adapter boundary. Latest preview uses .next-bot-turn-preview on port4016.
