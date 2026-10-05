# Cross-view object acquisition implementation plan

> For agentic workers: implement inline with executing-plans and TDD; review the final change independently.

**Goal:** Find the Scene-selected object in a different Target viewpoint without depending on equal pixels, object category names, or Target coordinates.

**Architecture:** Preserve existing fast acquisition and SAM tracking. Alternate failed fast searches with a bounded LoFTR local-feature fallback using immutable Scene context at two scales. Require at least eight distinct selected-region correspondences, over 80% geometric inliers, spatial coverage, a consistent Target object mask, duplicate rejection, and a second Target observation before initializing the existing memory tracker.

**Tech stack:** Existing Python/uv/OpenCV/PyTorch/SAM; pinned Kornia 0.8.3 and checksum-verified indoor LoFTR weights. No frontend controls or hardware output.

**Spec:** The user request in this chat: general Scene-to-Target selection across viewpoints, preserving existing video cases and preventing identity switches. Personal inputs remain ignored and local.

## Global constraints

- Work only in the existing Desktop worktree; preserve v3 and personal files.
- Keep original Scene evidence immutable; Target truth is measurement only.
- Category and similarity scores are not identity probabilities.
- Keep one model inference process running on this Mac.

## Review focus

- Unrelated visual-prompt detections must not block generic object proposals.
- Duplicate objects or incomplete candidate checking cannot yield a lock.
- Absence, frame dimension changes, camera generation changes, and errors discard pending proof.
- Context/background matches cannot establish selected-object identity.
- Slower initial acquisition must not freeze the live overlay or alter ordinary tracking.

### Task 1: Add bounded learned cross-view acquisition

**Files:** Create vision/learned_correspondence.py, vision/view_acquisition.py, vision/test/test_view_acquisition.py; modify vision/engine.py, vision/pyproject.toml, vision/uv.lock, vision/assets.json, vision/NOTICE.md and relevant viewer/research documentation.

**Interfaces:** LearnedCorrespondence.match(source, target) returns normalized local point pairs. ViewAcquisition(image, box, reference, matcher, segmentation).update(target, candidates) returns existing searching/ambiguous/matched protocol plus AcquiredRegion proof. Engine alternates this fallback with failed fast search and resets both at stream changes.

- [x] Write regressions for transformed-object acquisition, background-only points, collinear/reused points, duplicates, absence/expiry, malformed/weak masks, reset, and generic proposals after an unrelated visual proposal.
- [x] Run tests and observe missing-feature failures; existing screenshots already reproduce four failed blind attempts each.
- [x] Implement local point inference and geometric/mask/temporal policy; pin model assets and dependency. Keep original tracker unchanged.
- [x] Run full Python and frontend suites, Ruff and diff checks.
- [x] Replay both supplied screenshot pairs blindly, including removed/wrong/duplicate targets; replay all six motion cases and the complete blue-case video.
- [x] Review change independently, repair important findings with regressions, restore normal server on 4016, then commit locally.
