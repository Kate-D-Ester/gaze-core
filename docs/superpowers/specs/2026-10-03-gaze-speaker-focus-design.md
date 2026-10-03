# Gaze-selected speech separation

Status: approved by Kate on 2026-10-03; implementation awaits plan review.

## Purpose and success criteria

Add local audio-visual speech separation to GazeCore so Kate can select a visible person by click or calibrated scene gaze and listen to that person's speech in an overlapping conversation. The first reference is the already prepared, degraded CNN debate clip. The system must infer the output from the actual mixed audio and the selected person's video, rather than retrieve the Oxford demo's separated results.

Work takes place only in `/Users/kate/Desktop/Codex-projects/gaze-speaker-focus`, on `codex/gaze-speaker-focus`, branched from local `v3` at `5f7825bce28a1d0e47c40e23a6f2b7ded494b051`. Python uses uv; the existing frontend uses Bun. Follow v3's Next.js, React, Tailwind, separate TypeScript type files, and focused module conventions.

A complete delivery includes an actual pretrained separation engine, clip and live input paths, stable face selection, synchronized playback, explicit failure states, reproducible installation, meaningful tests, saved reference outputs, and measured performance on this M1 Pro with 16 GB RAM. Production code quality and a successful low-latency hardware benchmark are separate requirements. Neither perfect background removal nor real-time throughput is assumed.

## Approach

Recommended: retain browser gaze tracking and UI; add a separate, loopback Python inference service. The service processes mixed audio plus synchronized video from one selected face. This offers PyTorch CPU/MPS execution without porting an unverified research model into the browser. It also keeps the auth backend independent of inference.

Alternative: export the separation and visual encoders to browser-compatible models. This could eliminate the Python service, but entails recurrent-layer export, WebGPU/operator compatibility, and an additional numerical parity and performance investigation. It is not the initial implementation.

The first engine candidate is the four-layer RTFS-Net with its published LRS2 weights and pretrained CTCNet visual encoder. RTFS-Net code is MIT licensed; CTCNet code is Apache-2.0 licensed. Preserve notices for reused code and record checkpoint provenance separately. Do not assume the code licenses automatically establish all checkpoint or reference-media redistribution rights. Keep downloaded weights and the debate clip out of Git.

Before building the UI around this engine, verify checkpoint download, faithful loading, CPU execution, MPS support, and a genuine single-target inference on the degraded clip. RTFS-Net's published recurrent layers use SRU and its configuration uses bidirectional context. Any Apple Silicon compatibility changes must preserve checkpoint semantics and pass numerical comparisons with the reference implementation. Do not replace SRU with a different trained architecture, random weights, a generic denoiser, or a precomputed target track. If the engine cannot run correctly, report that concrete blocker before substituting an engine or claiming the system works.

## Frontend and selection

Add a public speaker-focus trial accessible from the dashboard, following existing browser-only route composition and shared UI components. The workspace provides the prepared reference, a local video upload, and a live capture mode; face overlays, selected-person status, original/focused audio controls, processing progress, output downloads, and service/latency information.

Face tracking creates session-local track IDs; these are positional tracking identities, not named-person recognition. Match observations over time, expire lost tracks, and refuse ambiguous reassignment. Manual face-region correction is available when the low-resolution video prevents reliable automatic detection. A manual region only supplies visual location; it never supplies a target audio track.

Click selection works independently of eye-tracker hardware. Gaze selection consumes the existing scene session's normalized camera-image position, validity, confidence, generation, and timestamps. Apply the same camera orientation to gaze and face boxes. Select after a stable dwell, with hysteresis to avoid rapid changes. Stale, off-frame, unverified, or ambiguous gaze cannot silently switch the target. Expose the gaze adapter through the scene workspace's live stage, rather than duplicating calibration mathematics or requesting an additional eye camera.

Switching targets increments a selection generation. Late inference responses for earlier generations are discarded. Losing a selected face pauses focused output and requests reacquisition; it must not select the largest remaining face automatically. Stop, source changes, seeking, and route unmount cancel work and release media resources.

## Local service and model boundaries

Create `speaker-service/` with a uv-managed, locked Python project. Keep configuration, input validation, media decoding, tracking/mouth preprocessing, model loading, inference scheduling, audio assembly, API transport, and benchmark reporting in focused modules.

The model boundary accepts mono 16 kHz PCM and a synchronized grayscale mouth sequence, and returns the selected waveform with timing and model/device metadata. RTFS-Net's published visual path uses 25 fps and 88 by 88 mouth inputs. Resampling 15 fps video does not restore missing lip detail; preserve that limitation in the report. Follow the published alignment and normalization rather than inventing substitutes to fit tensor dimensions.

Load one model instance, enter evaluation/inference mode, bound concurrency and memory, validate tensor shapes and finite values, and provide explicit CPU/MPS selection. A device fallback must be visible in status and measurements. Model assets use pinned provenance and checksums once obtained; downloads occur only through an explicit setup command, with atomic completion and actionable errors. Missing or incompatible checkpoints leave the service unready rather than start an imitation inference path.

Expose health/capabilities, clip analysis, target extraction, job progress/cancellation, output retrieval, and a bounded live-session channel. Use opaque job IDs and a configurable local data directory; never accept arbitrary server filesystem paths or remote URLs from the browser. Enforce media-size, duration, decoded-frame, request, and queue limits. Bind to loopback by default and allow only configured frontend origins. Cleanup completed/cancelled session data according to a bounded retention policy. The auth service is not needed for local trials.

## Clip and live audio timing

Clip processing uses source presentation timestamps, supports all detected targets, and caches only outputs actually computed locally from that source and model. The browser can then switch among these computed outputs during synchronized playback. Clearly distinguish this processed-file mode from live inference. Seeking resets scheduling and output timing.

Live processing uses timestamped audio/video chunks, bounded overlap and overlap-add assembly. A single selected target is processed at a time. Flush the queue on source or target changes; apply a short transition envelope so switching does not produce clicks. Delay the preview to match focused audio when needed. Show total buffering and inference delay, not only neural-network execution time.

Many ESP32 camera streams carry video only. Live separation therefore needs a separate microphone or another source containing mixed audio. Request microphone access only on explicit start. For separate camera and microphone clocks, expose synchronization offset and detect drift/discontinuities. An unverified network-camera arrival timestamp is not proof of audio/video alignment. Pause with an actionable synchronization message when the input cannot be aligned reliably.

If processing falls behind, keep a bounded queue and report overload. Do not present old audio as current. Original audio is an explicit listening mode; an inference error must never relabel the unprocessed mixture as focused output.

## Reference and verification

Reference file: `/Users/kate/Desktop/Codex-projects/scene-speech-reference/cnn-debate-low-quality-320x180-15fps.mp4`. It is approximately 32 seconds, 320 by 180 at 15 fps, with one original mixed mono AAC track. Its metadata is in `cnn-debate-reference.json` beside it. The preserved mixed audio's decoded PCM SHA-256 is `54975d021249f92cbd75f7b5a88d2e598db7ae4eb0a2915e47c8a13ef256de73` under the original preparation procedure.

Run real inference for each of the three visible speakers using only this degraded video. Save locally generated WAVs and synchronized preview videos, input/output hashes, model hashes, device, frame/track coverage, elapsed time, real-time factor, memory, and buffering latency. Listen to and inspect overlapping intervals for speaker identity, intelligibility, leakage, artifacts, and synchronization. Confirm target changes produce distinct model-conditioned outputs, not just volume changes. Check silence/lost-face behavior and cancellation.

This debate has no supplied clean reference stems, so do not invent SI-SDR/SNR improvement scores for it. Its status as a public research demo also prevents treating it as the sole held-out generalization test. Add an independent, reproducible mixture with isolated source stems reserved exclusively for evaluation; these stems must never enter the inference request. Compare target SI-SDR against the mixed baseline and assess target association.

Test selection geometry/orientation, dwell and hysteresis, stale evidence, track loss, out-of-order responses, input validation, timestamp alignment, overlap-add continuity, lifecycle cleanup, bounded queues, API errors, and genuine model loading/inference. Use real inference smoke checks separately from small deterministic unit tests. Run the existing frontend tests, lint, typecheck, and production build, plus service tests and checks. Exercise the UI in a browser using the reference clip and check switching, seeking, downloads, service loss, and recovery.

Real-time acceptance requires sustained end-to-end throughput faster than input on this M1 Pro for one target, without growing queues; report window/stride, warm-up, median and tail processing time, and total audible delay. If that fails, deliver the measured limitation and label the functioning processed-file mode accurately. Do not claim low-resolution or infrared ESP32 robustness from this proxy alone; later testing requires real camera/microphone recordings.

## Delivery and boundaries

Include one documented local startup flow, pinned model setup with notices, service configuration examples, frontend integration, benchmark instructions/results, and clean Git changes in the new branch. No merge, push, publication, or cloud deployment is part of this request. Leave the source v3 checkout and unrelated worktrees intact.

Design assumptions for review: local-only inference; RTFS-Net is the first candidate subject to a genuine inference check; both click and existing calibrated scene gaze selection; file playback and bounded live processing; honest measured performance rather than a guaranteed real-time or perfect-isolation claim.
