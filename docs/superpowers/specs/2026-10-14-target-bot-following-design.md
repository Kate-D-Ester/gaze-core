# Target camera bot following

## Intent

Use the object selected in Scene and independently matched in Target to center a mobile bot's POV and maintain a chosen object width. Extend the existing tracking worktree. Match Zero's existing signed MQTT controller protocol; do not change its firmware or publish test movement to hardware.

## Design

The browser already owns verified, timestamped Target boxes, camera orientation and source identity. A small visual servo planner derives a single movement from those boxes. A follower checks fresh evidence and owns movement scheduling. A guest MQTT session implements the existing Zero P-256 signed protocol, challenge enrollment, ownership epoch and heartbeat, with no admin key or password handling.

Publish non-retained QoS 0 packets to `<topicPrefix>/control`. Subscribe to `<topicPrefix>/state` and `<topicPrefix>/reply/<session>`. Car commands are F/B/L/R/S, with configured speed. Kate confirmed the Target camera is fixed on the car: vertical commands are disabled and no arm controls are exposed. Left/right means turning, as in the existing controller.

## Motion decisions

Default desired object width: 30% of Target image width. Default drive speed: 25%. Correct horizontal centering first, then width. Horizontal movement starts beyond 8% of the frame center and ends inside 4%. Width correction starts beyond 3% of frame width and ends inside 1.5%. A smaller object requests forward; larger requests backward. Width is apparent size, not measured physical distance. Suppress distance correction on edge-clipped boxes. Undo preview mirroring; keep the user-selected upright rotation.

Only accept matched scores strictly above 0.8, valid geometry and evidence/frame ages of at most 500 ms. Require two distinct accepted Target observations after enabling or losing the object. Renew a currently valid command at most every 250 ms, independently checking freshness every 50 ms. Search/ambiguity/stale frames immediately stop and wait for fresh reacquisition. Clear/reselection, camera source/generation/orientation changes, lost authority, hidden/unfocused page, setup and disconnect disable following. Stop cancels queued movement. Guard again after asynchronous signing so expired observations cannot publish. MQTT must not buffer offline QoS 0 commands.

## UI and configuration

Extend existing sticky command bar with compact Bot settings, Follow and Stop. Settings contain MQTT WebSocket endpoint/topic, optional broker credentials, access name, desired width, and speed. No default connection, automatic motion, persisted credentials or secret logging. Use the current component styles. Following remains off until explicitly enabled with control access and a Scene selection.

## Verification

Use a fake MQTT boundary and real signing to check firmware-compatible payloads, enrollment, state freshness, ownership loss and queued cancellation. Check direction, width, mirroring, hysteresis and edge clipping with literal boxes. Integrate real ObjectTracking with simulated moving boxes, loss, reacquisition and source changes. Run viewer regressions, frontend tests/typecheck/lint/build and unchanged vision tests. Render the minimal controls at desktop and narrow widths. Physical actuator behavior requires device testing.

## Execution

Proceed in the existing separate worktree under the user's standing instruction to build without repeated permission requests. Preserve unrelated v3 changes and keep the controller reference project read-only.
