# Gaze Speaker Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the voice of a person selected by click or calibrated scene gaze from actual mixed audio, with reference-video and live input support.

**Architecture:** Browser selection and playback use a separate loopback Python inference service. The service runs one pretrained audio-visual target extractor with synchronized mouth video and mixed PCM; processed-file and live behavior share the model boundary. Prove genuine inference first, then connect it to the existing Next.js UI.

**Tech Stack:** Bun, Next.js, React, TypeScript, Tailwind, uv, Python 3.12, PyTorch, FastAPI, FFmpeg, RTFS-Net/CTCNet pretrained visual encoder.

**Spec:** `docs/superpowers/specs/2026-10-03-gaze-speaker-focus-design.md` (approved by Kate on 2026-10-03).

## Global Constraints

- Work takes place only in `/Users/kate/Desktop/Codex-projects/gaze-speaker-focus`, on `codex/gaze-speaker-focus`, branched from local `v3` at `5f7825bce28a1d0e47c40e23a6f2b7ded494b051`.
- Python uses uv; the existing frontend uses Bun.
- Follow v3's Next.js, React, Tailwind, separate TypeScript type files, and focused module conventions.
- Do not replace SRU with a different trained architecture, random weights, a generic denoiser, or a precomputed target track.
- Keep downloaded weights and the debate clip out of Git.
- Production code quality and a successful low-latency hardware benchmark are separate requirements.
- Original audio is an explicit listening mode; an inference error must never relabel the unprocessed mixture as focused output.
- Leave the source v3 checkout and unrelated worktrees intact.

## Review Focus

- Variable frame rates, audio offset, and discontinuities must preserve lip/audio alignment or produce an explicit synchronization failure (Task 2).
- Similar faces crossing, leaving, or being covered must not silently transfer the selected voice (Tasks 2 and 5).
- Repeated uploads, huge decoded media, and cancellation during inference must keep storage, memory, and queued jobs bounded (Task 4).
- Browser seeking and rapid target changes must reject stale audio and keep video synchronized with the chosen voice (Task 6).
- A video-only ESP32 source, denied microphone access, or separate drifting capture clocks must produce actionable live-mode state (Task 7).

---

## File boundaries

Python package: `speaker-service/src/gaze_speaker/`. `settings.py` owns limits/origins/data paths; `schemas.py` owns transport data; `assets.py` owns verified model setup; `model.py` owns the engine; `media.py` owns decoding/timestamps; `faces.py` owns visual tracks/mouth alignment; `audio.py` owns windowing/assembly; `jobs.py` owns cancellation/retention; `api.py` owns HTTP; `live.py` owns live-session transport; `benchmark.py` owns measurement/reporting. Vendor only necessary inference modules under `speaker-service/third_party/rtfs_net/` with notices, a source manifest, and no training stack imported into the service.

Frontend feature: `frontend/apps/web/src/features/speaker-focus/`. `selection.ts` owns dwell/hysteresis/geometry; `client.ts` owns service calls; `capture.ts` and `audio-capture.worklet.ts` own timestamped capture; `playback.ts` owns audio/video clocks; `use-speaker-focus.ts` owns UI lifecycle; `speaker-focus-workspace.tsx` composes small source, target, playback, and status components. Each declared TypeScript schema/type has a matching `.types.ts` file.

### Task 1: Genuine pretrained engine and reproducible setup

**Files:** Create `speaker-service/pyproject.toml`, `uv.lock`, `.gitignore`, `README.md`, `src/gaze_speaker/{__init__,settings,assets,model}.py`, `third_party/rtfs_net/`, `tests/test_assets.py`, `tests/test_model.py`. Modify root `.gitignore` only for this subsystem's generated files.

**Interfaces:** `Separator.load(asset_dir: Path, device: str) -> Separator`; `Separator.extract(mixed_pcm: ndarray, mouth_frames: ndarray) -> ndarray`; mono float32 16 kHz, grayscale 25 fps 88x88 visual input, finite float32 output of the same audio length. `setup_assets(asset_dir: Path) -> AssetManifest` records source URLs/commit, file hashes and licenses.

- [ ] Install the unchanged frontend with `bun install --frozen-lockfile` inside the isolated worktree and run its tests as baseline; resolve environmental setup failures before attributing failures to changes.
- [ ] Create a uv-locked Python 3.12 inference environment with PyTorch and minimal service/preprocessing dependencies; keep uv and Torch build caches inside the Desktop worktree.
- [ ] Write failing asset/model tests: missing or wrong-shaped weights reject loading; path-traversing archives reject extraction; nonfinite or malformed input rejects extraction; output length equals input length.
- [ ] Run `uv run pytest tests/test_assets.py tests/test_model.py`; confirm failures represent missing behavior, not missing dependencies.
- [ ] Pin upstream RTFS-Net source commit `083348bc609275e05916ddc83ff64dd9ad95e9d0`, preserve MIT/third-party notices, obtain the published four-layer weights and CTCNet visual encoder, record SHA-256, and implement faithful loading/evaluation. Include only inference code; remove profiling/training imports without altering forward computation.
- [ ] Run a real checkpoint smoke inference on CPU. Check MPS operations explicitly; report a visible CPU fallback if needed. If recurrence compatibility needs code changes, compare outputs to upstream SRU CPU inference before accepting them.
- [ ] Run the asset/model tests and commit the functioning engine boundary. If genuine pretrained loading/inference fails, report the exact failure; do not proceed with an imitation engine.

### Task 2: Timestamped media, stable faces, and mouth preprocessing

**Files:** Create `speaker-service/src/gaze_speaker/{schemas,media,faces}.py`, `tests/test_media.py`, `tests/test_faces.py`.

**Interfaces:** `decode_media(path: Path, limits: MediaLimits) -> DecodedMedia` (mono PCM, sample rate, frame presentation timestamps, dimensions/duration); `track_faces(media: DecodedMedia) -> list[FaceTrack]`; `mouth_sequence(media: DecodedMedia, track: FaceTrack, start: float, duration: float) -> ndarray`. Tracks expose normalized boxes, visible intervals, and session-local IDs.

- [ ] Write tests for variable-rate frame mapping, nonzero audio start, nonmonotonic timestamps, decode limits, lost/crossing tracks, and border-clamped crops. Assert missing/ambiguous target evidence is rejected instead of selecting another face.
- [ ] Run `uv run pytest tests/test_media.py tests/test_faces.py` and confirm the expected behavior is absent.
- [ ] Implement bounded FFmpeg decode/probe without shell interpolation, explicit timestamp normalization, local face-landmark detection/tracking, and model-matched mouth alignment/normalization. Permit an explicit user-defined face region when detection fails; do not upsample from the original high-quality source behind the scenes.
- [ ] Run tests and analyze the degraded debate: inspect three stable face tracks, visible coverage, and mouth crops locally. Verify that resampling preserves the 15 fps source information and does not change the original mixed audio.
- [ ] Commit media and visual preparation.

### Task 3: Chunked extraction and actual debate benchmark

**Files:** Create `speaker-service/src/gaze_speaker/{audio,benchmark}.py`, `tests/test_audio.py`, `tests/test_reference_inference.py`; generated results live under ignored `speaker-service/data/benchmarks/`.

**Interfaces:** `extract_track(media: DecodedMedia, track: FaceTrack, separator: Separator, cancel: Callable[[], bool], progress: Callable[[float], None]) -> ExtractionResult`; `assemble_windows(windows: list[AudioWindow], sample_count: int) -> ndarray`; benchmark result records input/model hashes, selected track, device, elapsed time, throughput, memory, delay, and output paths.

- [ ] Write failing tests asserting constant-input overlap-add continuity, exact output length, finite/limited audio, cancellation, and missing-mouth interval behavior.
- [ ] Run `uv run pytest tests/test_audio.py` and inspect failures.
- [ ] Implement two-second inference windows with a one-second stride, boundary padding, correctly weighted overlap-add, and explicit target-loss handling. Keep window/stride configurable and report actual values.
- [ ] Run real extraction for all three faces using only `cnn-debate-low-quality-320x180-15fps.mp4`; save WAVs and synchronized preview videos. Listen to overlapping sections and inspect speaker association, leakage, artifacts, alignment, and distinct target conditioning.
- [ ] Prepare an independent reproducible mixture with clean stems confined to evaluation. Measure target SI-SDR relative to the mixture; verify inference receives only mixture and visual cues. Report debate quality descriptively, because it has no clean stems.
- [ ] Run all service tests to this point, save measured M1 Pro results with limitations, and commit extraction/reporting code (not model assets or copyrighted media).

### Task 4: Bounded local API and job lifecycle

**Files:** Create `speaker-service/src/gaze_speaker/{jobs,api,__main__}.py`, `tests/test_jobs.py`, `tests/test_api.py`; extend `settings.py`, `schemas.py`, `README.md`.

**Interfaces:** `GET /health`; `POST /clips` multipart upload; `GET /clips/{id}` returns analysis status/media/tracks; `POST /clips/{id}/regions` creates an explicit normalized face-region track; `POST /clips/{id}/extract` with target ID; `GET /jobs/{id}` status; `DELETE /jobs/{id}` cancellation; `GET /jobs/{id}/audio` and `/preview` only for completed genuine output; `DELETE /clips/{id}` cleanup. Error responses contain a stable code and human-readable message.

- [ ] Write tests for unknown IDs, unsupported uploads, empty/no-audio videos, MIME spoofing, invalid target IDs, 120 MB upload/120-second decoded duration limits, two queued jobs maximum, cancellation during extraction, retention, and forbidden origins.
- [ ] Run `uv run pytest tests/test_jobs.py tests/test_api.py` to confirm failures.
- [ ] Implement loopback port 4033, default exact origin `http://localhost:4001`, streamed size checking, opaque IDs, one inference worker, bounded queue, cooperative cancellation, response-schema validation, and session cleanup (30-minute idle retention and a 1 GB total data budget). Clip analysis also runs off the request event loop and exposes queued/analysing/ready/failed status. Do not accept arbitrary paths or remote URLs from clients.
- [ ] Exercise the API with the actual debate and disconnect/cancel while processing; run all service tests and commit.

### Task 5: Shared click/gaze selection and service client

**Files:** Create `frontend/apps/web/src/features/speaker-focus/{selection,client}.ts` and matching `.types.ts`; `frontend/tests/speaker-focus/{selection,client}.test.ts`.

**Interfaces:** `selectByPoint(tracks, point, timestamp) -> targetId | null`; `SelectionController.observeGaze(evidence, tracks, now) -> SelectionState`; explicit click/clear/reset methods; service client mirrors Task 4 DTOs and uses AbortSignal. SelectionState contains selected ID, selection generation, pending dwell, and reason.

- [ ] Write failing Bun tests for letterboxing/orientation, click selection, 500 ms dwell, 150 ms gaze freshness, hysteresis, ambiguous boxes, track expiry, invalid/unverified gaze, and source-generation resets.
- [ ] Run `bun test tests/speaker-focus/selection.test.ts tests/speaker-focus/client.test.ts` from `frontend` and inspect failures.
- [ ] Implement normalized image-coordinate selection and typed cancellable client calls, strict response validation, bounded polling, and actionable HTTP/network errors. Use the existing `GazeMeasurement` semantics; never reuse preview-only gaze as verified targeting.
- [ ] Run tests and commit the selection/client boundary.

### Task 6: Reference/upload UI, synchronized playback, and scene integration

**Files:** Create speaker-focus components/hook/playback modules with matching type files, `src/app/trial/speaker-focus/page.tsx`, `src/screens/speaker-focus-page.tsx`, `src/components/speaker-focus-client.tsx`, `frontend/tests/speaker-focus/{playback,lifecycle,workspace}.test.ts[x]`. Modify dashboard trial cards, scene live-stage composition, and frontend README. Add a reference-preparation command that copies only the approved local mixed test clip into an ignored public fixture directory.

**Interfaces:** `SpeakerFocusWorkspace` uses Task 5 selection/client; `PlaybackController` owns one media clock and original/focused listening mode. A scene adapter supplies scene pixels, generation, and verified gaze to the same controller; it reuses the active camera/session rather than requesting duplicate devices.

- [ ] Write failing tests for rapid target switches/out-of-order completion, seek while processing, source replacement, route unmount, object-URL/audio cleanup, service loss, and original/focused mode labels.
- [ ] Run targeted Bun tests and inspect failures.
- [ ] Implement reference/upload source controls, keyboard-accessible target buttons and face overlays, actual progress and cancellation, computed-output playback/downloads, original comparison, and service/device/delay status. Follow existing Tailwind/shared primitives; no unrelated UI redesign.
- [ ] Integrate the same selection controller into the existing scene live stage; keep calibration state authoritative and reset on source/orientation changes.
- [ ] Exercise all three real debate outputs in the browser, switch during overlap, seek, cancel, restart the service, and verify synchronization. Run targeted tests and commit.

### Task 7: Timestamped live capture and bounded streaming

**Files:** Create frontend `capture.ts`, `audio-capture.worklet.ts`, `live-player.ts` and matching type files; Python `live.py`; `frontend/tests/speaker-focus/{capture,live-player}.test.ts`, `speaker-service/tests/test_live.py`.

**Interfaces:** `WS /live` starts an explicitly configured audio/video session and accepts timestamped binary PCM/frame messages plus target generation changes; replies include output interval, generation, device, and errors. The browser capture controller returns a stop method and timestamped data; live playback schedules only current-generation output.

- [ ] Write failing tests for video-only ESP32 inputs, microphone denial, sample-rate changes, camera/microphone skew and drift, clock discontinuities, malformed binary frames, queue overload, target loss, reconnect, and stop/unmount resource release.
- [ ] Run targeted Bun and Python live tests; inspect failures.
- [ ] Implement AudioWorklet PCM capture/resampling, timestamped frame capture, two-second/one-second-stride live scheduling, explicit synchronization offset, 150 ms maximum residual audio/video skew, drift/discontinuity checks, a maximum two-window queue, queue backpressure, generation cancellation, overlap-add output and transition envelopes. Request microphone/camera permission only after user Start; show synchronization and overload failures.
- [ ] Test a timestamp-paced replay of the actual mixed debate through the live channel, including all target changes. Measure end-to-end delay and sustained throughput on this M1 Pro; distinguish replay transport coverage from a real ESP32 microphone/clock validation.
- [ ] Run tests and commit the functioning live path with truthful status.

### Task 8: Whole-system verification, review, and handoff

**Files:** Update subsystem/frontend/root guides; create `docs/gaze-speaker-focus-results.md`; resolve any scoped review findings.

- [ ] Run service tests/checks and frontend `bun test`, `bun run lint`, `bun run typecheck`, `bun run build`. Record exact results; fix change-related failures and rerun affected checks.
- [ ] Run the real debate benchmark and paced live replay using the final build. Save input/model/output provenance, warm-up, median/tail processing times, actual window/stride, real-time factor, memory, buffering and audible delay, and speaker-quality observations. Do not report real-time success if queues grow or output lags input.
- [ ] Verify browser reference load, upload, target selection, original/focused comparison, seeking, cancellation, downloads, service recovery, keyboard operation, and scene adapter lifecycle. Hardware gaze/ESP32 alignment claims require actual hardware evidence.
- [ ] Review the whole branch independently, address material findings, and complete a final diff/cleanliness check against the v3 base. Keep all generated caches, checkpoints, reference media, and outputs out of commits.
- [ ] Document one startup flow using uv and Bun, asset setup, configurable origins/data paths, limitations, and benchmark reproduction. Commit final code and documentation on this branch; do not merge/push/publish.

## Execution choice

Recommended: native execution in this session, followed by a fresh whole-branch review. The model, timing, transport, and UI interfaces are closely dependent, so implementing them sequentially keeps the reference benchmark and error handling consistent.
