# Audio device selection and live face preview (2026-10-04)

Focus now provides separate Microphone and Speaker / headphones selectors, with
browser-local remembered choices. The chosen microphone is requested by exact
device ID and feeds the existing capture/stream/isolation engine. Focused audio
uses the chosen Web Audio sink; changing output during listening preserves the
capture stream and selected face. A microphone change invalidates alignment.
Permission probes are explicit and immediately stop their tracks. Missing devices
and output-routing failures are visible rather than silently selecting another
physical device. Browsers without AudioContext.setSinkId show system-output guidance.

A pinned local MediaPipe worker detects faces independently of microphone capture.
The current scene shows clickable detected-face boxes and a Locked outline before
listening starts, alongside the existing verified gaze bubble. Preview identities
use mutual spatial matches, reject ambiguous collisions, and map to engine tracks
by location with the configured video timing offset. Manual region correction
crops both detectors, preserves physical overlay coordinates, survives listening
restart/detector retry, and resets with camera source/orientation. Startup and
buffered drain cannot accidentally advance audio generations through preview
selection or correction.

Verification: **842 frontend tests across 101 files**, lint, TypeScript, diff checks
and an isolated production build passed. Real-controller regressions exercise
chosen input/output routing, -500 ms alignment, reordered engine tracks, output
switching and preserved drain intervals. Native browser verification rendered the
actual Focus component with the existing recorded debate clip, detected three
faces and locked a face by mouse before microphone capture. Screenshot:
`speaker-service/data/benchmarks/reference-reliability/devices-overlay-preview.png`.
Independent read-only review found no remaining critical/important issue.

The recorded-scene verification did not capture physical room audio or verify
separation quality through physical headphones. Network cameras without capture
timestamps remain blocked for live isolation; the existing warning is unchanged.
Backend code/services and primary v3 were not changed.

---

# Visible failed accuracy results (2026-10-04)

After collecting five physical points, the human's accuracy result was **60.2 px
RMS and 64.1 px worst error**, with validation failed. Guided setup suppressed the
failure notice while hiding the existing error and recovery controls inside the
closed Adjust gaze disclosure. It then displayed the generic instruction to collect
five points, making a completed failed check appear not to have completed.

The guided status now shows the measured failed-check errors, and Accuracy result
opens automatically with the existing offset/recheck/recalibration controls. No
validation threshold, saved calibration, human offset or Focus gate was changed.
Collecting five points still measures accuracy; only a current passed check enables
gaze Focus. The real guided integration test now reproduces a failed check,
verifies visible recovery and locked Focus, applies its suggested correction, then
collects five fresh points and opens Focus after they pass. Its red run failed on
the closed disclosure before this repair.

Verification passed: **824 frontend tests across 98 files**, formatting, lint,
TypeScript and an isolated production build. Read-only review found no blocker.
The live Chrome camera session displayed the exact failed-check values after the
update, with its original offsets intact. Screenshot evidence is saved under the
ignored `guided-accuracy-failed-result.png` artifact. The human's physical mapping
remains failed until it is corrected and checked again; the agent did not fabricate
an accuracy pass. Backend services and primary v3 were not changed.

---

# Guided accuracy navigation repair (2026-10-04)

The human's saved unverified mapping opened Check accuracy, while that step's
breadcrumb was disabled. The parent reused the regular scene-gaze readiness flag,
which excludes an unverified hand/marker mapping. Speaker setup now reports that a
fitted mapping is present separately from its existing accuracy flag: the mapping
permits accuracy-step navigation, and current successful validation still gates
Focus. Regular scene-mode readiness is unchanged. The check panel explains the five
fingertip/marker positions required; the disabled Continue control explains its gate.

The regression first failed on the disabled accuracy breadcrumb. It uses real saved
profile restoration, the scene session and five-point validation in the rendered
workspace, verifies return navigation while unverified, and opens Focus only after
validation passes. **824 frontend tests across 98 files**, formatting, lint,
TypeScript and the isolated production build passed. Read-only review found no
blocking issue. Backend code and services were not changed by this repair.

Native input in the human's existing Chrome camera session reproduced Check accuracy
starting its five-point collection. It reported Hand not detected and waited for
fresh hand frames; the test was cancelled without replacing the saved mapping.
After the code update, Calibrate → Check accuracy navigation worked with both
cameras still connected. Evidence is saved at
`speaker-service/data/benchmarks/reference-reliability/guided-accuracy-navigation.png`.
The physical five-point check was not completed by the agent, so the human's profile
remains correctly unverified and Focus remains gated until it passes. The primary
v3 checkout is unchanged at `4756da0`.

---

# Available-input streaming and current picture (2026-10-04)

Kate requested that the reference behave like a real room: the picture must stay
current while selected-person audio arrives after processing. This supersedes the
picture/audio synchronization and fixed collection windows described in earlier
entries below. Reference video now plays natively at 1×. Current frames drive face
outlines and mouse selection; asynchronous JPEG encoding and local inference do
not rewind, slow or pause that picture. Changing the visible target flushes obsolete
audio and starts its new generation at the current source position.

The shared live/reference processor starts from the minimum supported 120 ms input,
then consumes available new audio whenever its one worker is free. It retains 400 ms
of already captured context without waiting for it to accumulate. Zero padding to
200 ms shape increments reduces repeated GPU setup; it contains no future speech.
Common shapes through two seconds are warmed before readiness; larger supported
shapes initialize when used. A 10 ms unpublished boundary smooths contiguous output,
followed by stateful RNNoise suppression. Adaptive browser reserve responds to
measured arrival variation. There is no three-second analysis collection wait or
fixed playback-delay cutoff. Model shape, capture integrity and byte limits remain
resource/correctness constraints. Slow processing alone is not a clock error.

Overload stops accepting focused input and drains accepted samples while the
reference picture and current scene tracking continue. The accepted selected face's
history is frozen for that drain, so later face disappearance cannot cancel it.
Switching back from Original to Focused resumes capture in a new generation without
seeking. Actual missing captured frames still produce a camera-timing error; relaxing
processing lateness does not invent lip evidence that was never captured.

Four complete native-speed runs used only elapsed original mixed PCM and detected
faces from the degraded debate. The fourth adds reproducible hiss, hum and transients
to that same complete mixture. All accepted and emitted exactly **510,976 samples**,
with no source pause, flow event, error, dropped interval or future input. Reports
retain input/model/native-library hashes in the ignored
`speaker-service/data/benchmarks/available-input/final-*` directories.

| Run | Median processing per result | p95 processing | p95 audio arrival delay | Total run |
| --- | --- | --- | --- | --- |
| final-left | 0.73 s | 0.96 s | 1.91 s | 33.45 s |
| final-middle | 0.73 s | 0.98 s | 2.00 s | 33.42 s |
| final-right | 0.74 s | 1.12 s | 2.29 s | 33.56 s |
| final-noisy-middle | 0.73 s | 0.88 s | 1.81 s | 32.93 s |

Arrival delay ends when output reaches the benchmark client. It excludes browser
playback reserve and physical device delay, so these are not microphone-to-ear
latency measurements. Native browser runs showed **about 3.2–3.6 seconds** of focused
playback delay while the current picture continued. Physical mouse input selected
the middle face, then a right-to-middle switch advanced the source from **145,600 to
155,200 samples in 0.527 seconds** without rewinding or pausing. The selected outline
showed Locked. Screenshot evidence is saved as
`data/benchmarks/reference-reliability/available-current-picture.png` inside the
speaker service. After the final feature-only restart, the page returned HTTP 200
and the model reported ready on MPS with protocol-3 available-input metadata. A
fresh physical click again locked the middle face during current-picture playback
(`available-activated.png`, approximately 3.2 s displayed delay). Test ownership was
released afterward; the reference tester was left without a loaded processing session.

Verification: **823 frontend tests across 97 files** and **166 backend tests**
passed; four model-marked unit tests were excluded. Actual installed AV-MossFormer2
and native RNNoise were exercised by the four separate complete paced benchmarks.
Python lint/formatting, frontend formatting/lint/types, and an isolated production
build passed. Read-only independent review found no remaining
correctness blocker after accepted-history drain and current-picture recovery fixes.

This does **not** achieve the requested 200–500 ms listening experience. The installed
model is noncausal, and millisecond scheduling does not eliminate model computation,
required visual evidence or playback continuity reserve. No clean individual voice
stems exist for this clip, so exact sample conservation and timing do not certify
perceptual isolation quality. Physical ESP32/camera, calibrated gaze, room microphone
and headphone performance were not validated in these checks. Earlier experimental
shape/warm-up reports remain preserved; the final table uses only the final profile.
The feature worktree remains separate from v3; no merge, push or publication is part
of this correction.

---

# Reference connection conflict repair (2026-10-04)

The human reported no rectangles and rejected mouse clicks despite the earlier
agent test succeeding. Reproducing the normal workflow in another tab showed
that an earlier test tab still owned the service's exclusive live session. The
rejected tab retained the mixed video but had no face observations; clicks
replaced the useful connection error with “Select a currently visible face.”
Closing the original test tab, allowing its teardown to finish, and reconnecting
restored all three reference face rectangles. This reproduced blocker was a
session conflict, not a proven runtime lease leak.

Selection and focused playback now preserve a rejected session's service error.
The connection button displays Reconnect when that tab cannot use the service,
even if the model is healthy. The video offers a reconnect hint and disables
manual correction while detection is unavailable. Original audio remains usable.

Review also confirmed two cleanup failure paths: a native processor disposal
exception could leave an awaited future unresolved, and failed/cancelled teardown
could skip releasing the worker lease. Cleanup now completes resource teardown
before releasing ownership, survives transport cancellation, and propagates
native disposal failures through the future. Exclusive inference is retained.

Verification: **816 frontend tests across 97 files** and **155 backend tests**
passed; four real-model tests were excluded. Lint, TypeScript, formatting, and an
isolated production build passed. Regression tests reproduced the selection/play
failures and cleanup exception failures before the fixes; a cancellation test
checks that ownership remains reserved until native cleanup finishes. Independent
read-only review found no blocking issue.

Native browser input verified Play-before-selection followed by a middle-face
click during playback, with the middle person locked. A feature-only restart and
clean development compilation activated the fixes. A fresh physical click again
produced the middle-face rectangle and Locked label. Another tab visibly showed
the busy-session message and Reconnect button; after the first tab left reference
mode, its reconnect restored all three face rectangles. Both test connections
were released afterward so they cannot occupy the user's processing session.

Evidence is saved under the ignored `session-*` prefix in
`speaker-service/data/benchmarks/reference-reliability/`, including
`session-mouse-lock.png` and `session-reconnect-ready.png`. These checks do not
certify perceptual separation quality or physical camera/gaze behavior. The
primary v3 checkout remains untouched.

---

# Reference mouse selection repair (2026-10-04)

Physical pointer selection now happens on the stable video surface at press time,
including clicks beside the small landmark rectangle. A visible 32-pixel-radius
mouse bubble uses the existing largest face/circle intersection rule. Background
clicks and equal-coverage cases retain an existing lock; keyboard activation keeps
explicit face-button selection. Manual region correction remains separate.

The replay state records only successfully painted source samples. Face outlines,
hit testing and spatial reacquisition use that sample rather than the advancing
audio cursor. Pending decode results are rejected across playback resets. Choosing
another face after the clip finishes prepares its location at the first frame;
focused replay retains the spatial target, while Original replay starts without
requiring detection.

Verification passed: **813 frontend tests across 97 files**, formatting, lint,
TypeScript and an isolated production build. New regression tests failed before
fixes for surface presses, nearby bubble clicks, detection shifts, displayed-frame
selection, background lock retention, painted frames between audio ticks, focused
EOF selection/replay and Original EOF independence. Independent review found no
remaining Critical or Important issue after its painted-frame and Original-mode
findings were fixed.

A clean-browser check initially exposed a stale development bundle: it combined
the current controller with the previous void-returning video draw method. A
feature-only restart and preserved cache backup forced recompilation. The served
bundle was verified to contain the numeric painted-sample return and no temporary
diagnostics. The local model then reported ready on MPS at port 4033. Native mouse
input on the narrow browser selected the right face by its head outside the box,
retained it on a background click, and prepared a left-face replay from zero after
the finished clip. Focused right playback reached its end; the observed delay near
26.8 source seconds was **5.5 seconds**, not a latency requirement or an isolation
quality score. A subsequent native left-to-middle switch during active focused
playback selected the middle face at approximately **20.4 source seconds**, kept
playing intent and buffered the new target. Evidence and logs use the ignored
`mouse-selection-*` prefix in
`speaker-service/data/benchmarks/reference-reliability/`.

This repair does not certify human-perceived separation quality or physical
ESP32/microphone/gaze behavior. The v3 checkout remains clean at `4756da0`.

---

# v3 synchronization (2026-10-04)

The speaker-focus branch incorporates v3 commit `4756da0`, including `35164e7`
(scene calibration retention) and `4756da0` (direct camera streams and layout
fixes). The four conflicts were resolved by adopting the direct browser camera
connection, removing the relay implementation/tests, preserving speaker-focus
scripts and dependencies, and combining the camera and local-inference guidance.
The feature launcher uses ports **4010 and 4033**; the obsolete feature relay on
4023 was retired. The calibration identity now uses retained canvas dimensions,
as in v3, while the guided speaker setup and calibrated focus path remain connected.

Verification passed: **804 frontend tests across 96 files**, frozen-lockfile install,
formatting, lint, TypeScript and an isolated production build. A scoped merge review
found no new Critical or Important integration issue. The Python service code was
not changed by this merge. After a feature-only restart, the test URL returned HTTP
200, the model reported ready on MPS, and browser setup, reference loading and mouse
face locking succeeded. Evidence and logs are in ignored
`speaker-service/data/benchmarks/reference-reliability/v3-sync-*` files.

The existing v3 checkout was not modified, and no branch was pushed or merged back
into v3. This records compatibility with the fetched v3 tip, not future edits.

---

# Reference playback reliability repair (2026-10-04)

Reference selection now uses the mouse position on the displayed face. Numbered
speaker labels and shortcuts have been removed; the selected outline says
**Locked**. Clicking that face again keeps the current playback generation and
cursor. Keyboard activation still selects the focused face button.

Three independent timing problems caused unwanted pauses: the native video kept
advancing while JPEG encoding skipped input frames; the player rejected a running
audio clock that lagged the wall clock by 150 ms; and the server rejected capture
packets more than one second after capture. Replay now seeks and delivers every
15 fps source frame before advancing its contiguous mixed PCM, accounts for normal
seek/encoding work inside cumulative frame deadlines, and slows under sustained
codec pressure. Playback follows the monotonic audio output clock. The server
checks per-kind capture-clock order without an arrival-age deadline. Generation,
actual audio/video sample alignment, capacity and backpressure checks remain.

Small-face detection retries the previous location in a fresh crop when full-scene
landmark detection misses it. Duplicate fits are merged only when box overlap and
landmark positions agree; distinct overlapping faces remain separate. All **479
JPEG-quality-70 frames** of the degraded debate retained the three initial spatial
identities with **zero missing frames** in the actual MediaPipe diagnostic.

Browser checks completed full final-code left, center and right focused runs with
their respective face outlines retained, without timing errors. The right run also completed while
frontend tests, lint and type checking used the CPU. The final-code right run showed
**6.6 seconds measured delay** near its end; this is an observation, not a latency
threshold or a microphone-to-ear measurement. A deliberate left-to-center mouse
switch at approximately 13.8 source seconds changed the outline to the center face,
buffered the new target, and completed playback to the end with that lock retained.
The page was left at the first frame with the left face locked, ready for Play.

Final code checks passed: **796 frontend tests across 97 files**, **156 service
tests** with real model/reference tests enabled (eight existing upstream warnings),
lint, TypeScript, Ruff and an isolated production build. Regression tests failed
before fixes for skipped frames, duplicate fits, repeated selection, wall/output
clock lag, delayed camera/replay packets, decode overhead and mouse coordinates.
The independent review's pacing issue and pointer-location note were addressed;
its subsequent capture-clock review found no Important issue.

Evidence is in ignored `speaker-service/data/benchmarks/reference-reliability/`:
complete test logs, actual detector observations and browser screenshots/snapshots.
Speech-isolation quality is still not certified by human listening, and physical
ESP32/microphone/gaze/headset behavior remains untested. No v3 changes were made.

---

# Adaptive streaming measurements (2026-10-04)

Current implementation: protocol v2, engine-specific context, stateful RNNoise,
dynamic playback reserve and exact final flushing. The fixed four-second / GSP1
measurements below are historical and do not describe the current listener.

Apple M1 Pro, 16 GB unified memory, macOS 27.0. Actual AV-MossFormer2 device: MPS.
The checkpoint SHA-256 remains
`0e60209aab0b31c38deea4ab116100acbbf3a07db8bc559f796f118da1a767d5`.
The tested native RNNoise dylib SHA-256 is
`b0b0f3c038b8106f04c638596bd8d6594bddaeeaef5db39c5b401de80334efee`.

## Actual paced mixed-input replay

The 31.936-second degraded debate's single original mixed PCM and only elapsed
video frames enter the same WebSocket/worker/overlap/noise path as the browser.
No target stems or future face observations enter inference. AV context is
3 seconds / 1.8-second stride; original mixed PCM may be decoded ahead for source
storage, but it is sent only as playback advances. Six final per-person baseline
and seeded-noise runs completed with **510,976 accepted and emitted samples**
each, no stale-generation output accepted, and conserved final drain.

| Run | Output samples | Processing median / p95, s | Arrival-delay p95, s | Source flow pause, s |
| --- | ---: | ---: | ---: | ---: |
| baseline-left | 510976 | 1.498 / 1.709 | 4.976 | 0.248 |
| baseline-middle-corrected | 510976 | 1.617 / 1.934 | 4.999 | 0.415 |
| baseline-right | 510976 | 1.516 / 1.651 | 4.822 | 0.210 |
| noisy-left | 510976 | 1.579 / 1.804 | 4.898 | 0.267 |
| noisy-middle | 510976 | 1.655 / 2.180 | 5.228 | 0.507 |
| noisy-right | 510976 | 1.625 / 2.074 | 5.102 | 0.454 |

Latency is a measurement, never a pass threshold. Arrival delay is measured from
the first source sample's capture clock to receipt, not physical microphone-to-ear
latency. Browser testing showed **Focused · 5.0 s delay**, a progressing played
source cursor and selected-face outline. Model context remains even on faster
hardware. The player dynamically adds reserve, preserves late valid output,
rebuffers on underrun and keeps audio rate unchanged. It does not impose a fixed
four-second deadline. A slow live computer stops capture, drains accepted content
and offers Resume; replay pauses source advancement under worker backpressure.

Explicit correction regions were used: left `[0,0.05,0.35,0.65]`, center
`[0.40,0.10,0.20,0.55]`, right `[0.65,0.05,0.35,0.65]`. The initial broad center
region produced a multiple-face error at 23.45 seconds and remains saved as an
incomplete test (`baseline-middle`); a tighter single-person region completed.
Before the reliability repair recorded above, automatic full-scene browser tracking
also dropped identities on this clip. Those older failures motivated the paced
frame feeder, crop retry and duplicate-landmark fixes. The historical runs below
are retained for comparison.

Synthetic noise seed **20261004** adds hiss, 50/100 Hz hum and brief transients to
one complete mixture. Noise MOV SHA-256:
`4d1b39cfb5f0e8027085c32b0e57dfbeb48901b3b5df0633c1d2d5eeceaf8965`.
The fixture mux preserves the final partial audio packet; a real mux regression
caught and fixed FFmpeg `-shortest` trimming. It does not recreate physical ESP32
optics, IR sensitivity, room acoustics or microphone synchronization.

All six focused WAVs are finite, retain exact duration and peak below 0.70.
`signal-diagnostics.json` records actual output boundary steps; these are not an
audible click/pumping or intelligibility score. Sampled process RSS ranged from
0.20 to 0.57 GB across these runs, and excludes unsampled GPU/unified allocation.
The reports retain individual RSS values, warm timings, processing stages, queue
and flow events, capture maps, hashes, errors and source/output intervals.

## Listening artifacts and limits

Local artifacts are under ignored `speaker-service/data/benchmarks/adaptive-streaming/`.
Every run directory contains `original-mixed.wav`, `focused.wav`,
`focused-preview.mp4` and `report.json`. Compare baseline and noisy versions at
0–10, 10–18 and 19–27 seconds for target presence, shared moderator speech,
consonants, gain, pumping, clicks and audio/video alignment. The MP4 previews align
source audio/video for listening and do not themselves reproduce browser delay.

Conservation, finite output and different conditioned waveforms do not prove
clean voice isolation. There are no debate clean stems, so no debate SI-SDR,
PESQ, STOI or perceptual score is reported. Saved comparisons require human
listening; this session does not certify subjective quality. Native denoising's
separate controlled GRID test checks consonant-band retention and zero residual
sample lag, not arbitrary-noise quality. Competing voices and artifacts can remain.
No physical gaze/headset/ESP32 or hours-long live trial was performed.

Browser verification covered actual Buffering→Focused playback, original-mode
comparison after a busy service, seeking, manual correction and safe target loss.
Output clock suspension and rebuffering retain the played source cursor for retry.
Pause/recovery reacquires the selected identity at its played observation, requiring
explicit selection when that evidence is missing. Processing errors retire the
generation before queued audio can play. Reconnect reopens streaming ownership
without reloading the decoded source; service errors remain actionable through
socket cleanup. A paced-decoder regression verifies bounded frame/PCM dispatch and exact
EOF conservation, including delayed seek and JPEG encoding. Controlled concurrent requests verify atomic live/batch admission,
including the dequeued-but-unfinished worker interval. Late playback permission
completion cannot start a replacement source or fail disposal. Screenshot evidence:
`focused-playback.png`, `narrow.png`, `desktop.png`. Guided setup/calibration and
bubble/sticky-lock regression coverage remain in the frontend suite.

Final post-review verification: **792 frontend tests across 96 files** and
**150 service tests**, with all real-model/reference flags enabled and eight known
upstream warnings. Frontend lint, type checking, production build and Ruff passed.
Production build used an ignored copy of the same frontend source so the running
feature URL was not interrupted. The v3 relay was checked at the earlier feature restart; its checkout was not changed.
After the final review, Kate explicitly approved a brief feature restart after
automatic approval initially blocked it. Reference playback was released before
restarting only the feature launcher. All three feature ports returned, the model
reported ready on MPS with an empty queue, and the test page returned HTTP 200.
The running backend now includes the atomic worker-admission fix.

The independent final review found seven Important recovery/admission issues;
each received a failing regression before its fix. Three minor gaps are deferred:
the underrun boundary fade, automatic first-frame preview after EOF, and a rolling
processing/output telemetry ratio. Human listening and physical long-session
acceptance remain outstanding as described above.

Reproduction commands are in [the service README](../speaker-service/README.md).
Use `--automatic-faces` for full-scene tracking rather than correction regions.

---

# Historical speaker-focus measurements (2026-10-03)

Final branch measurements, 2026-10-03. This report separates processing throughput, playback delay, and speech quality.

Apple M1 Pro, 16 GB unified memory. RTFS-Net four-layer LRS2 checkpoint plus CTCNet visual encoder, 11,926,898 parameters. Actual device: `mps-video/cpu-audio`. Audio runs on CPU; visual encoding runs on MPS. Full MPS is unsupported by the checkpoint's adaptive pooling operations. Model/checkpoint notices are in `speaker-service/README.md` and `third_party/rtfs_net/NOTICE.md`.

Input: `cnn-debate-low-quality-320x180-15fps.mp4`, SHA-256 `53859a95bade8484604726ca442499bdd6b6c4a64c51efe64180e051af3d9062`. Only this 320×180, 15 fps, CRF34 video and its single original mixed audio stream entered inference. No original higher-resolution frames or Oxford target tracks were used. Three source-derived face tracks were processed; the right face required the explicit normalized region `(0.65,0.08,0.32,0.53)` for continuous coverage.

Each extraction uses 2-second context windows, a 1-second stride, 25 fps nearest source frames, and normalized overlap-add. End padding repeats the last video frame and pads audio with zeros; missing faces inside the real clip fail extraction. Warm-up is separate. Outputs have exactly 510,976 samples at 16 kHz (31.936 seconds).

| Target (left→right) | Manual region | Extraction seconds | Real-time factor | Window p95 seconds |
| --- | --- | --- | --- | --- |
| 1 | False | 24.505 | 0.767 | 0.813 |
| 2 | False | 25.293 | 0.792 | 0.958 |
| 3 | True | 24.514 | 0.768 | 0.801 |

Decode took 0.386s; full clip face analysis took 8.989s; model load took 2.344s and separate warm-up took 1.790s. Peak sampled process RSS was 1.042 GB; final MPS driver allocation was 1.175 GB, reported separately rather than added as a claimed unified-memory peak. These extraction times exclude decode, full-clip analysis, load, warm-up and export. Clip extraction faster than clip duration does not prove live latency; the paced replay below measures the live path.

Generated WAVs, synchronized MP4 previews, hashes, complete window timings and tracks are in ignored local `speaker-service/data/benchmarks/debate/`. A faster-whisper tiny.en transcription diagnostic is saved alongside them. It gives different transcripts for different targets, but shows substantial cross-speaker content and degraded intelligibility in some intervals. ASR is not a human listening test or an accuracy score. The available tool could not process audio for listening; these previews are prepared for explicit original/focused comparison in the UI. Do not claim clean isolation, perfect background removal, or a verified human listening assessment.

## Independent known-stem evaluation

Two official [GRID examples](https://spandh.dcs.shef.ac.uk/gridcorpus/) were downloaded locally for research evaluation, equalized to 0.1 RMS and mixed into one mono stream. A split-screen 320×180, 15 fps CRF34 video was created, retaining lossless PCM in MOV for exact ground-truth timing. The inference function receives only that mixed video. Separate clean WAVs are accessed only after extraction to compute SI-SDR. Provenance, hashes and preparation code are in `gaze_speaker.evaluation` and ignored `data/evaluation/`.

| Target | Mixture SI-SDR dB | Focused SI-SDR dB | Improvement dB |
| --- | --- | --- | --- |
| male.wav | -0.03 | 1.18 | 1.22 |
| female.wav | -0.03 | 16.33 | 16.36 |

The male target improves only modestly. These two short out-of-domain examples do not establish general quality. The debate has no clean reference stems, so no debate SI-SDR or SNR score is reported. Our five-point canonical alignment differs from the training pipeline's mean-face asset; this and the degraded lip detail can affect quality. The camera proxy does not reproduce ESP32 optics, wide-angle distortion, IR sensitivity or physical microphone synchronization.


## Paced live transport

The final replay sends the same original mixed PCM in 100 ms packets and source-derived JPEG frames at their 15 fps presentation timestamps. The local WebSocket service uses the real checkpoint, 2-second context and 1-second stride. Left, center and corrected right targets are selected in three phases. No clean audio, target stems or high-resolution video enters this path. Source PCM SHA-256: `e23629cd1e913273b84e8fa7e891f20b093f48d6ce751ca4fa8ef52c1426244b`.

| Measurement | Final replay |
| --- | --- |
| Source / total wall duration (including drain tail) | 31.936 / 35.091 s |
| Connection and face-preprocessor setup | 0.655 s |
| Actual output | 25 × 1-second chunks across all three phases |
| Inference window median / p95 | 0.770 / 0.959 s |
| First cold model window | 1.443 s |
| Arrival delay from chunk start, p95 / maximum | 3.115 / 3.376 s |
| Maximum waiting model windows | 1 (limit 2) |
| Sampled service process RSS | 1.012 GB |
| Deliberate preview/audio playout delay | 4.000 s |

All accepted chunks arrived before the fixed 4-second deadline, with no growing queue or overload. Warm-up, target-reset gaps and the undrained final overlap tail explain the difference between source duration and output count. The corrected-region change produced its expected explicit pause and required reselection; no older-generation output was accepted. A separate earlier cold-service replay produced 24 chunks, median 0.751s / p95 1.447s, maximum arrival 3.888s and process RSS 0.904 GB, illustrating timing variation. Memory values are sampled process RSS; neither is a complete unified-memory peak including GPU allocations.

This establishes paced local pipeline throughput on this machine for this short fixture. It does not establish sustained hours-long operation, physical ESP32/microphone synchronization, gaze accuracy, or instant listening. Browser playback delays both the listening preview and audio by 4 seconds. Stale frames, discontinuity, residual skew over 150 ms, overload and missed playout deadlines pause focused output. Arrival-only ESP32 streams are rejected for live speaker focus because upstream latency drift cannot be observed. Use USB camera mode with an explicitly started separate microphone and checked audiovisual offset, or a synchronized recording. Live sessions are bounded to 120 seconds.

## Verification and reproduction

The final post-review frontend run passed **712 tests across 86 files** (0 failures); lint, TypeScript checking and the production build passed. The Python run enabled both real-checkpoint and real-reference tests and passed **87 tests**, with eight known upstream CUDA/TorchScript/profiling/padding warnings. Ruff passed. The production build includes the public `/trial/speaker-focus` route. A fresh whole-branch review and the fixes listed below are complete; these checks ran after the fixes.

Browser testing covered reference loading, local file upload, all three actual model outputs, manual correction, switching/cancellation during processing, source-clock seeking, original/focused playback, WAV/MP4 download, service-loss/restart recovery, responsive layout and keyboard speaker selection. Calibrated scene selection consumes the existing scene camera/calibration lifecycle and has generation, freshness, uncertainty and disposal regression coverage. No physical headset or ESP32 test was performed. The saved browser downloads are actual model outputs, not the reference site's pre-separated demos. Browser sound playback was exercised; an audible quality assessment remains uncertified as stated above.

Follow the root README's two-terminal startup. From `speaker-service`, reproduce clip and live measurements with:

```sh
uv run python -m gaze_speaker.benchmark ../frontend/apps/web/public/speaker-reference/debate.mp4
uv run python -m gaze_speaker.live_benchmark --origin http://127.0.0.1:4010 --server-pid <service-python-pid>
GAZE_MODEL_TESTS=1 GAZE_REFERENCE_TESTS=1 uv run pytest -q
uv run ruff check src tests
```

The live benchmark requires the running local service. Face detector asset SHA-256 is `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`. The separator/config/visual checkpoint SHA-256 values and official download URLs are pinned in `gaze_speaker.assets` and recorded in ignored `data/assets/manifest.json`; the final benchmark report records them again. Complete per-window timings, source/output hashes, tracked observations, WAVs and previews remain local in ignored `speaker-service/data/benchmarks/{debate,live,ui}/`. The reference source is the Oxford project's [mixed CNN debate video](https://www.robots.ox.ac.uk/~vgg/demo/theconversation/demos/cnn2/mix.mp4).


## Independent review fixes

A fresh read-only whole-branch review found source audio gaps were flattened, positional IDs survived unverified occlusion, network arrival timestamps could not prove capture alignment, and VP8 WebM could not be copied into an MP4 preview. Each received a failing regression before its fix: real muxed internal-gap rejection, physical-person labels exchanging positions during occlusion, immediate live-track removal, network rejection despite fresh arrivals/manual checking, and real even/odd VP8 WebM export. Microphone permission was also moved before reserving a live WebSocket session; a pending/late-permission regression verifies no idle session is opened and a canceled late stream is released. Reacquisition is intentionally conservative; an interrupted face track requires reselection rather than positional reassignment. Subjective listening and physical ESP32/gaze performance remain unverified.
