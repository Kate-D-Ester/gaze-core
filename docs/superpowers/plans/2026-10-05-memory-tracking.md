# Memory-based tracking implementation plan

> Execute inline with systematic-debugging, TDD and verification-before-completion. Kate explicitly authorized autonomous implementation in the existing isolated worktree; no additional approval handoff is required.

**Goal:** follow selected visual regions through movement/angle/posture changes without the fixed-crop rejection problem.

**Architecture:** compare prompted segmentation with bounded memory against the current NanoTrack plus crop gate, retain independent Scene/Target state and verified acquisition, and enable only the measured improvement.

**Tech stack:** existing Bun/uv/Python/PyTorch local service; pinned official model source/assets.

**Spec:** ../specs/2026-10-05-memory-tracking-design.md

## Tasks

- [x] Probe EdgeTAM in ignored local experiments. Verify actual mask extent, MPS compatibility, bounded memory and per-frame timing. Compare six private cases, initially with targeted short runs; evaluate SAM 2.1 Tiny if EdgeTAM fails quality or runtime requirements. Keep the live server on the existing committed version until evidence supports replacement.
- [x] Write failing behavior tests for angle/posture updates, absence and identity-preserving recovery, state bounds and model sharing. Implement a small dedicated streaming tracker behind the existing engine interface, with explicit local model preparation and dependency/license notices. Preserve original-reference acquisition; replace inappropriate per-frame pixel equality with model memory and measured evidence.
- [x] Replay the same video independently for Scene/Target through its endpoint; inspect per-case overlays and reviewed checkpoint accuracy. Verify loss/distractor/recovery behavior with real public data and meaningful regressions. Report all remaining failures.
- [x] Run appropriate Python/frontend checks, obtain independent code review, commit the isolated change and restart only the verified project-owned 4016 server after passing evidence. Keep private outputs ignored.

Review focus: no accidental other-instance promotion; thin parts versus whole-person masks; open/closed hand deformation; recovery after disappearance; timing and memory on 16 GiB M1 Pro; no network/model downloads from runtime frame requests; stale source/generation responses.
