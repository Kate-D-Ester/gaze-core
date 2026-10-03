# Adaptive Speaker Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver clear, continuously processed selected-person audio with hardware-dependent playback delay and environmental-noise suppression in both reference and live modes.

**Architecture:** Share one local visual extraction, overlap assembly, and stateful noise-suppression pipeline. Separate source sample time from capture time, then feed a generation-safe adaptive browser player through a versioned streaming connection. Reference playback sends only elapsed mixed PCM and presented video frames.

**Tech Stack:** Existing Bun/TypeScript/React browser app; uv/Python/FastAPI/PyTorch/MPS service; existing AV-MossFormer2 and RTFS checkpoints; pinned `pyrnnoise==0.4.5` with existing SciPy for streaming rate conversion.

**Spec:** `docs/superpowers/specs/2026-10-04-adaptive-speaker-streaming-design.md`

**Execution:** Implement here with `superpowers:executing-plans`, then independent whole-change review. Kate already selected this method; do not ask her to choose again.

## Global Constraints

- Work only in `/Users/kate/Desktop/Codex-projects/gaze-speaker-focus`, branch `codex/gaze-speaker-focus`; do not merge, push, or publish.
- Preserve guided calibration/accuracy gating, bubble dominance, 0.5-second dwell, sticky identity, and face-loss behavior.
- There is no product hard cap on acceptable playback delay. Resource limits still protect memory and session ownership.
- Initial streaming profiles: AV three seconds / 1.8 seconds; RTFS two seconds / one second. Do not select smaller context from timing alone.
- One inference worker; at most two waiting inference windows. Do not silently drop microphone speech or use raw mixture as focused output.
- Stateful noise suppression after overlap assembly; no per-chunk normalization or denoiser reset.
- No future media, precomputed focused audio, or clean stems supplied to the streaming extractor.
- Active live listening ends on explicit stop or a real failure, rather than the uploaded-clip duration limit.
- Keep TypeScript types in matching `.types.ts` files, use braces, one variable declaration per statement, and no nested ternaries. Follow KISS, DRY, and existing UI primitives.
- Keep feature ports 4010/4023/4033; preserve v3's checkout and relay on 4022.

## Review Focus

- An older frontend connects to the new service: fail with a protocol-version message, not incorrect timing (Task 1/3).
- A suspended tab resumes after source time has stopped: do not replay old audio or silently replace the source clock (Tasks 4/6).
- A person leaves while old inference or a native denoiser call runs: reject its generation and release state (Tasks 3/5).
- An unsupported/corrupt upload or denied AudioContext resume: keep Original comparison usable and release object URLs/resources (Tasks 6/7).
- Concurrent file export or a second tab tries to use the one inference worker: report busy rather than causing hidden live backlog (Tasks 3/7).

---

## File responsibilities

Backend: `stream_profile.py` owns profile/sample values; `live_protocol.py` owns packets and bounded source buffering; `live_overlap.py` owns weighted sample assembly; `noise.py` owns native denoising and rate-conversion state; `stream_processor.py` owns one generation's extraction/assembly/enhancement; `live_session.py` owns source, targets, flow and drain state. Keep `live.py` focused on WebSocket lifecycle/validation. `jobs.py` retains worker ownership and initialization; `schemas.py` exposes capabilities.

Frontend: `stream-protocol.ts` owns binary packets; `stream-connection.ts` owns the versioned socket; `adaptive-jitter.ts` owns measured reserve; `live-player.ts` owns audio scheduling and source cursor; `preview-buffer.ts` owns encoded-frame retention. `live-controller.ts` retains camera/gaze orchestration. `replay-source.ts` owns source decoding and incremental feeding; `replay-controller.ts` owns reference lifecycle/selection; `reference-workspace.tsx` owns the minimal reference UI. New modules have matching `.types.ts` files.

## Commands and artifacts

Run Python commands from `speaker-service` with `UV_CACHE_DIR=../.cache/uv TORCH_EXTENSIONS_DIR=../.cache/torch TMPDIR=/Users/kate/Desktop/Codex-projects/gaze-speaker-focus/.cache/tmp`; use `/Users/kate/Library/Python/3.9/bin/uv` if uv is not on PATH. Run Bun commands from `frontend`, using `/opt/homebrew/bin/bun` if needed. Desktop writes and actual GPU commands require the host's approved escalation path. Never install dependencies in v3.

Keep generated evidence in ignored `speaker-service/data/benchmarks/adaptive-streaming/`, including input/model/package hashes and saved comparisons. Do not overwrite earlier benchmarks. The approved mixed reference is `/Users/kate/Desktop/Codex-projects/scene-speech-reference/cnn-debate-low-quality-320x180-15fps.mp4`.

### Task 1: Versioned source clocks and general overlap assembly

**Files:** Create `speaker-service/src/gaze_speaker/{stream_profile,live_overlap}.py`; modify `live_protocol.py`; create frontend `stream-protocol.ts/.types.ts`; update `capture.ts` packet re-export. Tests: `speaker-service/tests/test_stream_protocol.py`, `test_live_overlap.py`, `frontend/tests/speaker-focus/stream-protocol.test.ts`.

**Interfaces:** `StreamProfile(window_samples: int, stride_samples: int)`; `profile_for(engine_key: str) -> StreamProfile`; `AudioSpan(start_sample: int, pcm: ndarray)`; `CaptureSpan(start_sample: int, end_sample: int, capture_time: float)`; LiveWindow retains the capture spans covering its input; `Packet(kind, generation, sample_start, capture_time, payload)`; `encode_packet(kind: int, generation: int, sample_start: int, capture_time: float, payload: bytes) -> bytes`; matching TS `packetBytes(kind, generation, sampleStart, captureTime, payload): ArrayBuffer`. `LiveBuffer(profile, max_pcm_bytes, max_frame_bytes)` accepts `audio(sample_start, capture_time, pcm)`, `frame(sample_start, image)`, returns `window(final=False) -> LiveWindow | None`. `LiveOverlap(profile).push(start_sample, pcm, source_end_sample=None) -> list[AudioSpan]`, `flush(source_end_sample)`, `reset()`.

- [ ] Write failing tests for cross-language header layout, rejecting GSP1/unsafe indices/nonfinite timestamps, exact consecutive sample indices, AV 48000/28800 and RTFS 32000/16000 profiles, constant-signal overlap with arbitrary stride, reset, partial final output, and no duplicate final flush. Pin the packet layout to little-endian `<4sB3xIQdI`: magic GSP2, kind, generation, source sample index, capture time, byte count; JS rejects indices above `Number.MAX_SAFE_INTEGER`.

```python
assert profile_for('av-mossformer2') == StreamProfile(48000, 28800)
assert profile_for('rtfs') == StreamProfile(32000, 16000)
assert decode_packet(encode_packet(1, 3, 1600, 10.0, pcm)).sample_start == 1600
# Feed an irregularly chunked constant source through an identity model.
assert assembled.size == source.size
assert np.allclose(assembled[240:-240], source[240:-240], atol=1e-6)
```

- [ ] Run `uv run pytest tests/test_stream_protocol.py tests/test_live_overlap.py` and `bun test tests/speaker-focus/stream-protocol.test.ts`; confirm the intended assertions fail against the old protocol/assembly.
- [ ] Implement the interfaces, finite/alignment validation and normalized weighted accumulation. Source buffering retains only data needed for current/pending windows; default PCM budget is 4 MiB and decoded-frame budget 128 MiB. Keep existing 200 ms PCM packet and JPEG dimension limits. EOS pads only the final boundary, emits actual samples once, and never alters source indices.
- [ ] Run the targeted commands; confirm all pass and existing malformed-packet protections remain covered.
- [ ] Commit only this task's files: `feat(speaker): version sample-clock streaming and overlap assembly`.

### Task 2: Stateful environmental-noise suppression

**Files:** Create `speaker-service/src/gaze_speaker/noise.py`, tests `test_noise.py` and `test_noise_native.py`; modify `speaker-service/pyproject.toml`, `uv.lock`, and service README with provenance/installation.

**Interfaces:** `NoiseSuppressor.process(span: AudioSpan) -> list[AudioSpan]`, `flush() -> list[AudioSpan]`, `reset()`, `close()`; `delay_samples: int`, `name: str`. Rate-conversion state remains private to this module. One instance belongs to one generation and runs only on the existing inference worker.

- [ ] Write failing tests for irregular chunks versus one continuous input, exact source sample count after flush, preserved start index, duplicate-flush protection, reset, finite/gain limits, and initialization errors. Use an injectable identity native frame processor for DSP alignment tests and a separate actual-native smoke/quality fixture; do not treat the identity fixture as noise-suppression evidence.

```python
assert sum(span.pcm.size for span in processed_and_flushed) == input_pcm.size
assert processed_and_flushed[0].start_sample == input_start_sample
assert np.isfinite(joined).all()
assert float(np.abs(joined).max()) <= 0.98
```

- [ ] Run `uv run pytest tests/test_noise.py`; confirm the missing state/alignment behavior fails.
- [ ] Pin `pyrnnoise==0.4.5` using uv and inspect the locked wheel/native licenses and hashes. Implement continuous 16→48→16 kHz rate conversion using stateful 61-tap FIR filters and persistent decimation phase; derive/verify filter delay and the native processor delay. Process RNNoise's 480-sample frames with persistent state; preserve residual partial frames and compensate delay on output/flush. Use a smooth limiter, not chunk normalization. Native failure must raise a capability/runtime error.
- [ ] Run DSP and actual native tests, record native version/provenance, and compare noisy speech versus clean speech for noise reduction and consonant preservation. Reject a native integration that changes duration or damages speech; document any platform issue instead of substituting an unverified denoiser.
- [ ] Commit: `feat(speaker): add stateful local environmental-noise suppression`.

### Task 3: Shared processor, flow control, warm-up and drain

**Files:** Create `stream_processor.py`, `live_session.py`; modify `live.py`, `jobs.py`, `schemas.py`, `settings.py`, `api.py`; tests `test_stream_processor.py`, `test_live.py`, `test_jobs.py`, `test_api.py`.

**Interfaces:** `ProcessedAudio(span: AudioSpan, captures: list[CaptureSpan], timings: dict[str,float])`; `StreamProcessor(separator, profile).process(window: LiveWindow, track: FaceTrack, generation: int) -> list[ProcessedAudio]`, `finish(source_end_sample: int)`, `reset(generation)`, `close()`. `LiveConfig.protocol_version=2`; controls `target`, `region`, `pause`, `resume`, `heartbeat`, `end(source_end_sample)`, `stop`. Reply types: `ready`, `selected`, `faces`, `audio`, `flow`, `drained`, `error`. Audio declares generation/start_sample/sample_count/sample_rate=16000/capture_spans/device/timings/queued_windows/pcm. Capture spans partition emitted samples and preserve the source-to-capture mapping through replay pauses; merge adjacent spans only when their capture clocks are continuous. Ready declares protocol/profile/noise processor/warm timing estimates. Flow declares pause/resume, queue occupancy and reason. Health separates extraction readiness from streaming/enhancement readiness.

- [ ] Write failing tests for obsolete-version rejection, generation changes during extraction/enhancement, final-tail drain, paused replay heartbeat with constant source time, waiting-queue capacity, busy file extraction while a live owner exists, enhancement failure without raw fallback, and live lasting beyond the clip duration limit.

```python
assert all(reply['generation'] == new_generation for reply in delivered_audio)
assert len(waiting_inferences) <= 2
assert drained_sample_count == accepted_source_sample_count
assert paused_source_index == resumed_source_index
```

- [ ] Run targeted Python tests and verify failures are on the new contract/state transitions.
- [ ] Implement worker-only extraction → overlap → NoiseSuppressor, exact intervals, timing stages, and EOS drain. Warm the nonzero full profile input before streaming ready; exclude one cold call and record three warm runs. Report initialization failures without destroying Original/file capabilities. Reserve the existing worker during live ownership; report busy instead of letting batch jobs consume its queue. Send flow signals before exhausting the waiting queue, retaining at most one 200 ms in-flight PCM reserve. On microphone overload, drain accepted input before closing capture; for replay, hold source advancement. Keep one-second packet freshness against capture time and 150 ms alignment against source time. Permit paused heartbeat ownership; remove live's inherited 120-second clip deadline.
- [ ] Run targeted tests, including fake slow workers; confirm valid lateness is never classified as clock corruption and malicious/malformed inputs still fail.
- [ ] Commit: `feat(speaker): stream enhanced audio with bounded adaptive flow`.

### Task 4: Adaptive sample-based audio player and synchronized frames

**Files:** Create frontend `adaptive-jitter.ts/.types.ts`, `preview-buffer.ts/.types.ts`; modify `live-player.ts/.types.ts`; tests `adaptive-jitter.test.ts`, `live-player.test.ts`, `preview-buffer.test.ts`.

**Interfaces:** `StreamAudioChunk = {generation,startSample,captures,pcm}`; `LivePlayer.audio(chunk): boolean`, `reset(generation)`, `getTiming(): PlaybackTiming`, `sourceSample(): number | null`, `flushEnd(sourceEndSample)`, `dispose()`. `PlaybackTiming` exposes state, reserveSeconds, bufferedSeconds, delaySeconds and hardware-latency availability. `PreviewBuffer.add(sourceSample,jpeg,generation)`, `drawAt(canvas,sourceSample,generation)`, `reset()`, `dispose()`; asynchronous decodes release superseded bitmaps.

- [ ] Replace the old fatal-lateness test with a failing recovery test. Test ten-second-old contiguous output accepted on arrival, source duplicates/gaps rejected, generation reset stops old sources, underrun buffering/resume, suspended/drifting AudioContext, no mid-speech rate change, EOF drain, sample cursor alignment, piecewise capture-to-source delay after replay pauses, and encoded-frame memory release.

```typescript
expect(player.audio({ generation: 2, startSample: 0, captures: [{ startSample: 0, endSample: pcm.length, captureTime: 0 }], pcm })).toBe(true)
expect(timing.state).not.toBe("failed")
expect(secondScheduledStart).toBeCloseTo(firstScheduledEnd, 6)
expect(player.sourceSample()).toBe(expectedPlayedSample)
```

- [ ] Run `bun test tests/speaker-focus/{adaptive-jitter,live-player,preview-buffer}.test.ts`; verify the previous fixed-offset player fails.
- [ ] Implement append-only scheduling with source indices and AudioContext anchors. Initial reserve is the greater of two audio quanta, available base latency, and warm p95-minus-median variation. Track the last 32 valid same-generation interarrival deviations; use the positive p95 plus one audio quantum. Increase reserve after underrun; retain estimates but reconsider reserve at a new generation. Do not rewrite scheduled samples or speed up speech. Bound unscheduled PCM to 4 MiB and encoded previews to 64 MiB; signal resource failure explicitly. Hardware timing is nullable when unsupported.
- [ ] Run targeted tests; preserve genuine clock-discontinuity rejection and verify continuous chunks avoid per-chunk fades.
- [ ] Commit: `feat(speaker): adapt playback buffering to output arrival`.

### Task 5: Shared streaming connection and live camera integration

**Files:** Create frontend `stream-connection.ts/.types.ts`; modify `live-schema.ts`, `client-schema.ts`, `client.types.ts`, `capture.ts/.types.ts`, `audio-capture.worklet.ts/.types.ts`, `live-controller.ts/.types.ts`, `live-panel.tsx`; tests `stream-connection.test.ts`, `capture.test.ts`, `live-panel.test.tsx`, lifecycle/selection tests.

**Interfaces:** `StreamConnection.open(config,signal): Promise<ReadyReply>`, `packet(bytes)`, `select(generation,targetId)`, `control(value)`, `close()`; injected client/socket factory permits lifecycle tests. Capture callbacks carry exact source sample start and capture time. Camera source indices use the existing common performance/audio origin, keeping face timestamps compatible with scene gaze evidence. Connection callbacks expose validated replies, flow, errors and disconnect.

- [ ] Write failing tests for version mismatch, variable PCM lengths matching sample_count, late permission cleanup, generation changes during JPEG encoding, flow-stop without prematurely disposing accepted playback, stale denoiser/error replies, switching Original/Focused without both routes audible, and the existing bubble/object/face-loss behavior.
- [ ] Run `bun test tests/speaker-focus`; confirm failures identify the new reply contract rather than incidental test setup.
- [ ] Extract socket ownership from LiveController into StreamConnection; allow at most 1 MiB per validated reply, validate actual base64 byte count against sample_count, and validate finite PCM plus complete capture-span coverage. This replaces the old 100000-character response limit, which would reject AV's 1.8-second output. Keep current gaze/identity selection. Route Original raw PCM only on explicit Original selection. On flow/resource overload stop accepting microphone input, send EOS for accepted samples, keep player/socket alive through drain, then show explicit Resume. Stop/unmount still closes every owned resource immediately. Report measured delay/buffering through one small status line.
- [ ] Run targeted tests and camera/gaze lifecycle regressions; no extra camera/microphone permission during setup or reference mode.
- [ ] Commit: `feat(speaker): connect live gaze focus to adaptive streaming`.

### Task 6: Incremental mixed-video replay source and lifecycle

**Files:** Create frontend `replay-source.ts/.types.ts`, `replay-controller.ts/.types.ts`, `use-speaker-replay.ts`; tests `replay-source.test.ts`, `replay-controller.test.ts`.

**Interfaces:** `ReplaySource.load(fileOrReferenceUrl,signal): Promise<ReplayMedia>`, `play()`, `pause()`, `seek(sourceSample)`, `setFlow(paused)`, `dispose()`. `ReplayMedia` declares dimensions/duration/sampleCount and the original mixed audio only. `ReplayController` exposes subscribe/getSnapshot, loadReference/loadFile, play/pause/seek/select/listen/correct/connect/dispose and draw(canvas). It consumes Tasks 4/5, not ClipSession extraction jobs.

- [ ] Write failing tests that packets never end beyond the currently advanced source sample, pause/flow retains exact sample indices, no extraction/analysis HTTP job is called, whole-file focused output cannot be consumed, seek resets generation, EOF emits/drains the final partial audio, unsupported decode/denied playback releases resources, and late bitmap/native replies cannot repaint a new source.

```typescript
expect(sentAudio.every((packet) => packet.endSample <= advancedSample)).toBe(true)
expect(extractionRequests).toHaveLength(0)
expect(sentSamplesAfterResume).toEqual(originalRemainingMixedSamples)
expect(disposedObjectUrls.size).toBe(createdObjectUrls.size)
```

- [ ] Run the two replay test files; confirm failure against missing replay ownership.
- [ ] Decode only original mixed audio in the browser at 16 kHz; full source decoding is permitted for storage, but send only elapsed samples in at most 200 ms packets. Use a muted input video and presented-frame callbacks for source video; never derive future face tracks. Pause video/source advancement on flow, heartbeat while paused, and preserve partial PCM. Enforce existing 120 MiB/120-second upload bounds before use, finite mono mixing, and explicit supported-codec errors. Display frames and overlays using the player's source cursor; preserve current-track validation on selection. Original/Focused switches use that cursor and reset obsolete output. Own source URL, decode cancellation, timers, socket, bitmaps, and AudioContext explicitly.
- [ ] Run targeted tests, including large-file cancellation and source replacement while decode is pending.
- [ ] Commit: `feat(speaker): replay reference through incremental live extraction`.

### Task 7: Minimal streaming reference UI and separate file exports

**Files:** Modify `reference-workspace.tsx/.types.ts`, `workspace.tsx`, `status.ts`; create `replay-stage.tsx/.types.ts`, `replay-source-controls.tsx/.types.ts`, `file-export-workspace.tsx/.types.ts`; preserve `ClipSession`, `VideoStage` and processed-file helpers only behind explicit File export. Tests `reference-streaming.test.tsx`, `workspace.test.tsx`, `live-panel.test.tsx`.

**Interfaces:** ReferenceWorkspace consumes ReplayController; FileExportWorkspace owns the retained processed-file flow on explicit entry. ReplayStage renders source-cursor frames, current selectable identities, keyboard controls and correction. The guided setup handoff remains unchanged.

- [ ] Write failing UI tests for Play/Pause, explicit Original/Focused, Buffering without raw audio, actual delay, service/busy/enhancement failure, processed-file progress absent from streaming reference, and reference→setup cleanup preserving calibration.
- [ ] Run targeted UI tests and verify the previous whole-file ReferenceWorkspace fails the streaming expectations.
- [ ] Implement the compact video, person controls, listening toggle and one status/delay line. Focused warm-up is silent and visibly Buffering. Keep file processing/export as an explicit separate action with accurate labeling. Remove old fixed-delay copy and extraction progress from the streaming workspace; keep technical details under Details. Preserve decoded first-frame presentation at EOF and accessible labels.
- [ ] Run tests, then inspect rendered desktop and narrow-layout states using real screenshots. Check focus controls, selected-face outline, Buffering, normal playback and failure/resume without expanding the UI into an explanation wall.
- [ ] Commit: `feat(speaker): make reference testing stream while listening`.

### Task 8: Actual paced playback, noisy comparison and independent review

**Files:** Modify `speaker-service/src/gaze_speaker/live_benchmark.py`; create `streaming_reference.py` and `noise_fixture.py`; tests `test_streaming_reference.py`, `test_noise_fixture.py`; update README, service README, `docs/speaker-separation-research.md`, `docs/gaze-speaker-focus-results.md`.

**Interfaces:** CLI `uv run python -m gaze_speaker.streaming_reference --input PATH --output PATH --origin http://127.0.0.1:4010`; noise fixture CLI takes input/output/seed and creates one fully mixed audio stream. Replay report records source/output sample intervals, hashes, timings, flow events, queue trend, native package/model provenance and memory; browser evidence adds scheduled/audible-cursor timing.

- [ ] Write failing benchmark tests for conservation of source samples across flow pauses and final drain, old-generation rejection, provenance, and absence of a fixed latency pass criterion. Test that noise augmentation changes the mixed stream reproducibly without creating target stems for inference.
- [ ] Run targeted tests and verify the old GSP1/four-second benchmark fails.
- [ ] Implement timestamp-paced replay through the same v2 channel. Save original and seeded hiss/hum/transient variants, per-person focused outputs, aligned videos and machine-readable timing/memory reports. Treat augmentation as synthetic coverage. Inspect consonants, leakage, pumping/clicks and alignment; provide saved audio comparisons for human listening rather than claiming quality from ASR/correlation alone.
- [ ] Run `bun test`, `bun run lint`, `bun run typecheck`, `bun run build`; run `uv run ruff check src tests` and `GAZE_MODEL_TESTS=1 GAZE_AV_MODEL_TESTS=1 GAZE_REFERENCE_TESTS=1 uv run pytest`. Confirm full output, not previous counts. Restart only the feature launcher, check all three feature ports and v3 relay survival, then run the final reference and noise replay plus rendered-browser interactions. Report genuine limitations and do not claim physical microphone/ESP32 validation from replay.
- [ ] Use requesting-code-review for one independent review of this change; resolve actionable findings with receiving-code-review and meaningful regression verification. Commit documentation/evidence links and final fixes. Leave the worktree on its feature branch with the running test URL; do not merge/push/publish.

## Self-review and handoff

All spec sections map to Tasks 1–8. Shared names use source sample indices throughout; capture time is a separate float clock. Generation reset intentionally discards obsolete-person output; flow pause preserves accepted source content. Noise alignment and final drain are covered independently and through the streaming replay. Every Review Focus condition has an owning task/test. Native execution and subsequent independent review are already selected; the remaining gate is Kate's review of this written plan before implementation.
