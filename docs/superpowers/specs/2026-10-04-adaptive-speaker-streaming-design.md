# Adaptive speaker streaming

Date: 2026-10-04
Branch: `codex/gaze-speaker-focus`
Status: approved by Kate on 2026-10-04; available-input/live-picture correction explicitly authorized by “go ahead do it.”

## Intended outcome

Kate wants continuous, local listening to the person selected by click or calibrated gaze. Playback delay must follow the computer's actual processing performance. Clear, intelligible speech and stable playback take precedence over achieving a fixed millisecond target. Both the reference debate and a real camera/microphone session must run through the same incremental extraction and noise-suppression pipeline. The reference must demonstrate processing during playback, without a precomputed focused waveform or access to future media samples by the extractor.

Preserve the approved guided setup, gaze-bubble overlap selection, sticky person identity, and target changes after dwell. Looking at an object keeps the current person selected. A lost face pauses extraction. Switching people invalidates old queued output so the previously selected person cannot continue playing after a switch.

This changes streaming, playback scheduling, and reference playback interfaces, so it is an architectural extension of the approved speaker-focus design.

## Current evidence

The existing live transport uses two-second model input windows, one-second output strides, and a fixed four-second browser playback offset. The browser treats output arriving outside that offset as a fatal synchronization error. Reference selection uses a whole-file extraction job before focused playback.

The installed AV-MossFormer2 model is not a stateful causal model. Each inference needs an audio/video context window, which contributes delay even on fast hardware. On this M1 Pro, a diagnostic using the actual degraded debate and the production model measured these warm medians:

| Input duration | Model computation |
| --- | --- |
| 0.2 s | 0.292 s |
| 0.4 s | 0.308 s |
| 0.8 s | 0.471 s |
| 1.2 s | 0.627 s |
| 2.0 s | 0.945 s |

These are three warm timing repetitions after one warm-up per shape. They establish neither short-window separation quality nor sustained microphone-to-ear performance. Smaller windows will not be selected merely because the model accepts their shapes. The existing three-second / 1.8-second schedule remains a whole-file extraction profile. Live/reference input must not wait for that future context; short-input timing and quality require separate measurements.

## Selected approach and alternatives

Keep the installed visual target extractor, generalize its overlap assembly, add stateful local noise suppression after extraction, and replace the fixed playback offset with an adaptive output queue. Process available captured input as soon as the worker is free, retaining past samples as context. Retained context must not add an intentional collection wait. Measure quality and throughput; do not claim a causal or millisecond-grade model merely because scheduling is faster.

A new causal target extractor could reduce model context delay, but the researched audio-conditioned alternatives need voice enrollment and a reliable association between each voice and visible person. That changes initial acquisition and is outside this extension. Merely enlarging the current fixed buffer would not provide incremental reference playback, noise suppression, or sustainable operation when processing is slower than input.

## Shared local audio pipeline

The shared pipeline is:

`timestamped mixed PCM + timestamped scene frames -> selected-face extraction -> weighted overlap assembly -> stateful noise suppression -> adaptive playback`

Use the existing single inference worker and engine-specific face preparation. Generalize `LiveBuffer` and `LiveOverlap` to explicit window and stride values. Each output declares its exact source interval and sample count. Live processing uses a minimum 1,920 samples (120 ms, three visual frames), 6,400 samples of retained past context, and at most one active inference. Each next call consumes the currently available new audio, aligned to the visual frame quantum; only newly captured samples are emitted. Model input is zero-padded to a finite set of shapes spaced 200 ms apart (plus its 120 ms minimum); common shapes up to two seconds are prewarmed. Padding repeats only the last captured visual frame and never postpones collection until those padded samples exist. Unused MPS allocator buffers are released after warm-up. The supported 128,000-sample model input maximum is a shape/resource bound, not a playback deadline. A 160-sample unpublished boundary is blended between calls. The former fixed schedules remain available for whole-file processing. No fixed four-second playout value is negotiated. Profile values, engine, noise processor, and measured processing time are visible through capabilities/status.

Version the streaming protocol so an older client fails clearly instead of silently assuming fixed durations. Packets carry both a source presentation/sample clock and a client capture/dispatch clock; replies identify the source sample interval. Use the source clock for audio/video alignment and the client clock for transport freshness. A paused replay keeps its source position and sends heartbeat/control messages; it does not pretend that source time continued. Live capture uses a shared audio/video origin and still checks actual clock drift.

Preserve continuous sample indices. Do not infer continuity from arrival order or round timestamps independently for every chunk. An end-of-source message flushes a final partial window with documented boundary padding, trims output to actual source samples, and drains the overlap/noise-processing tail exactly once. Padding is boundary handling, not future source data.

The inference worker measures preparation, extraction, overlap assembly, and noise processing separately. Model initialization and warm-up happen before accepting a listening session; their time is shown as setup, rather than causing an unexpected first audible stall.

## Background noise suppression

Evaluate and integrate RNNoise through a pinned `pyrnnoise` package as the post-extraction noise processor. RNNoise is a noise-suppression library, not an individual-speaker separator. It supplements the visual extractor for environmental noise such as fan hiss, hum, and transient sounds. Its voice-activity probability must not be used to claim a speaker's identity or replace actual separation with muting.

Maintain one denoiser state and one resampling state per target generation. RNNoise processes 480 samples at 48 kHz; the separator's 16 kHz output therefore needs continuous, stateful rate conversion. Resampling and denoiser delay must be measured and included in source/output timing. Do not initialize the denoiser for every audio chunk, normalize each chunk independently, or silently substitute raw mixture when enhancement fails. Preserve finite samples and gain, and prevent clipping with a smooth output limiter.

The candidate package currently publishes version 0.4.5, including a macOS 26 universal wheel. Installation uses uv with locked distribution hashes; initialization performs no downloads. This host reports macOS 27.0, satisfying the advertised wheel OS requirement. Verify supported-platform installation, native dependency provenance, licenses, and actual runtime before selecting it. A failed native initialization produces a clear service capability error and leaves Original comparison available. A technically working denoiser that audibly damages the target voice does not pass the release check.

## Adaptive audio playback

Replace `start + 4 seconds` scheduling with an explicit source-sample cursor, an AudioContext playback cursor, and a bounded FIFO of current-generation output. On the first focused chunk, choose an initial jitter reserve from measured warm processing/arrival variation and the browser audio quantum. Begin playing available output after that reserve; do not wait for the entire source.

Append contiguous chunks at the end of scheduled audio. Ordinary inference or transport variation changes the amount of buffered audio; it is not a fatal synchronization error. The jitter estimator uses a rolling tail statistic of output interarrival variation, including processing and transport. It excludes startup and target changes. Faster stable hardware starts with less reserve. Slower or fluctuating hardware can build more reserve.

If the playback queue runs dry, fade at the boundary, enter a visible Buffering state, and resume with an increased reserve when contiguous output is ready. Never replay a chunk, jump backwards, accelerate spoken words, drop speech to satisfy a latency target, or modify already scheduled samples. An accumulated reserve is reduced at a new listening/target generation, using recent successful measurements; it is not removed abruptly during a spoken phrase.

Report actual source-to-scheduled-playback delay from the current output cursor. Include browser base/output latency when available and mark unavailable hardware latency separately. This is a software timing estimate, not a physical acoustic round-trip measurement. Source gaps, non-finite data, impossible clock drift, and stale generations remain errors; lateness by itself is recoverable buffering.

## Throughput and resource bounds

There is no product hard cap on acceptable playback delay. Resource limits still protect memory and session ownership. Track queue bytes and sample counts instead of tying validity to a four-second wall-clock deadline. Keep one running inference and a bounded waiting queue, plus bounded encoded frame and PCM retention. Surface any resource limit honestly.

A larger buffer can absorb jitter but cannot make a permanently slow processor keep up with continuous input. Report both current delay and a rolling processing-to-emitted-audio ratio. Reference input follows native video playback at normal speed, independently of the processor. Sustained overload must not pause or rewind the picture to make the demonstration appear live. Real microphone input cannot pause the conversation: finish accepted queued audio, show that live capture cannot keep up on this device, stop accepting new capture at the resource boundary, and require an explicit resume. Do not silently discard microphone speech or present an increasing backlog as healthy live listening.

Overload control is separate from malformed packet, camera/microphone drift, and source-staleness checks. Replay pause/resume rebases transport timing without inventing new source timestamps. Existing session ownership, local-origin checks, upload/resource limits, and cancellation protections remain authoritative. Active live listening ends on explicit stop or a real failure, rather than inheriting the uploaded-clip duration limit; pause/heartbeat ownership and memory remain bounded.

## Incremental reference and upload playback

Add a replay source adapter to the existing live transport, rather than using a clip extraction job. Feed decoded original mixed PCM and corresponding video frames only as the source clock advances. The separation worker must not receive the remaining file, precomputed focused output, future face observations, or clean stems. Reuse the actual server live face detector, target IDs, selected-generation handling, extraction, enhancement, and playback queue.

Use a separate input media element and visible playback surface. Focused reference frames follow the current input video, never the delayed audio cursor. The reference simulates a real room: its picture stays current while delayed focused audio becomes audible as soon as the worker and audio output can deliver it. Face overlays use observations for the displayed frame; a click can select only an identity still present in the current tracker. The live-camera overlay remains current so gaze locks the person in front of the user, while a small delay indicator explains delayed listening.

Provide explicit Play/Pause, Original/Focused, person selection, and a small status/delay line. In Focused mode, show Buffering until focused PCM is available; raw mixed audio is only played in the clearly selected Original mode. Original comparison uses the corresponding source time and never plays alongside focused audio. Seeking, changing sources, stopping, returning to setup, or changing targets flushes obsolete output. A normal target change selects a current spatial face directly without pausing, seeking, or resetting the advancing source clock. End of file drains accepted output and returns to a decoded first frame for replay.

Keep any whole-file export workflow separate and label it as file processing; it is not the default reference test and cannot satisfy streaming acceptance. Follow the existing minimal UI conventions and keyboard-accessible speaker controls.

## Verification and acceptance

Automated tests cover adaptive startup/reserve, slow and variable output arrival, recovery after underrun, sample continuity, final partial-window flushing, source-clock rebasing, target switches while inference is pending, stale generation rejection, Original/Focused transitions, bounded resource behavior, and complete stop/unmount cleanup. Test denoiser state continuity, rate conversion, sample alignment, silence, gain, and finite/clipped output. These tests must expose audible/timing regressions rather than simply mirror implementation.

Run the actual degraded debate at timestamp pace through the final browser reference UI and server live channel. Save mixed-input/model/package hashes, selected person, context/stride, preparation/inference/enhancement timings, initial and steady playback delay, buffering events, queue trend, memory, and locally produced audio/video. No complete focused waveform may exist before the reference starts. Exercise all visible people, target changes, face loss, pause, seek, Original comparison, EOF, and replay.

Also run a reproducible noisy variant containing the same one mixed audio stream plus seeded environmental-noise augmentation. Clearly label synthetic hiss/hum/transients as augmentation, not proof of real-room robustness. Use clean speech/noise fixtures only for a separate denoiser correctness/quality assessment; do not provide clean target stems to the extraction engine. Inspect target intelligibility, interference leakage, noise suppression, consonant preservation, pumping, clicks, and audiovisual alignment. Provide saved comparisons for human listening; correlation or an ASR transcript alone is not a separation-quality score.

Run meaningful targeted tests, frontend lint/typecheck/build, the complete relevant backend suite, and independent review before claiming the extension is ready. Report the achieved delay and quality limitations without a fixed latency pass/fail threshold. A paced replay is not physical ESP32/microphone validation; retain the existing requirement for verified camera/audio timing in real capture.

## Delivery

Work only in the existing Desktop feature worktree. Keep the user's v3 checkout/services independent. Restart only the feature runtime when implementation is ready, and retain the test URL `http://127.0.0.1:4010/trial/speaker-focus`. Commit the reviewed change, generated benchmark evidence remains ignored, and do not merge, push, or publish.

## Primary references

- [Installed visual-extraction project](https://github.com/modelscope/ClearerVoice-Studio)
- [RNNoise source and noise-suppression purpose](https://github.com/xiph/rnnoise)
- [Python wrapper and streaming frame/chunk APIs](https://github.com/pengzhendong/pyrnnoise)
- [pyrnnoise distribution metadata and supported wheel platforms](https://pypi.org/project/pyrnnoise/)
