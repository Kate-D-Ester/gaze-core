# Local speaker inference

The model extracts a target voice from mixed 16 kHz mono PCM and synchronized
mouth video. Its checkpoints are obtained explicitly and verified against pinned
SHA-256 hashes. Downloaded assets and generated audio stay outside Git.

```sh
uv sync --frozen
uv run python -m gaze_speaker.assets --dir data/assets
TORCH_EXTENSIONS_DIR="$PWD/../.cache/torch" GAZE_MODEL_TESTS=1 uv run pytest
```

`cpu` runs the complete model on CPU. On Apple Silicon, `auto`/`mps` runs the
visual encoder on MPS and the recurrent audio model on CPU. This hybrid path is
reported as `mps-video/cpu-audio`; it is compared numerically against CPU output.
The original model's adaptive pooling prevents complete MPS execution.

Model code: RTFS-Net commit `083348bc609275e05916ddc83ff64dd9ad95e9d0`, MIT;
see `third_party/rtfs_net/NOTICE.md`. The pretrained visual checkpoint is provided
by CTCNet's authors. Checkpoint and reference-video provenance are documented
separately from software licensing. The published weights are approximately
265 MB including their training metadata; the inference model has 11,926,898
parameters. Actual inference memory and throughput are measured, not inferred
from checkpoint size.

## Optional AV-MossFormer2 engine

RTFS remains the default for the service and existing benchmark commands. Select
`av-mossformer2` explicitly to try the larger pretrained visual target model.
Its weights are obtained only by the setup command, verified against a pinned
SHA-256, and loaded with PyTorch's weights-only loader. The vendored architecture
and its device portability patch are documented in
`third_party/av_mossformer2/NOTICE.md`.

```sh
uv sync --frozen
uv run python -m gaze_speaker.assets --engine av-mossformer2 --dir data/av-assets
# Reuse the already verified local research download instead of downloading again:
uv run python -m gaze_speaker.assets --engine av-mossformer2 --dir data/av-assets \
  --checkpoint data/research/clearvoice/last_best_checkpoint.pt
uv run gaze-speaker --engine av-mossformer2 --assets data/av-assets --device auto \
  --origin http://127.0.0.1:4010
GAZE_AV_MODEL_TESTS=1 uv run pytest tests/test_av_model.py
```

On Apple Silicon this engine runs its complete network on MPS with `auto`/`mps`;
`cpu` is supported but measured at about 9 seconds per 2 seconds of input. It has
68,516,407 parameters. Both clip and live input paths use its official 25 fps,
112x112 grayscale face-box crop and 0.4161/0.1688 normalization. RTFS retains its
aligned 88x88 mouth input. The two prepared formats cannot be interchanged.

Whole-file AV extraction uses 3-second windows and 1.8-second stride.
Live/reference processing consumes available input instead of waiting for that window. Streaming has generalized
weighted overlap-add, exact EOF trimming and continuous native noise suppression.
One worker loads the model, checks the native runtime and warms common input
shapes through two seconds before advertising streaming readiness. The minimum
shape runs one cold pass and three measured warm passes; those measurements seed
adaptive playback. Larger supported shapes are initialized when needed.
File extraction remains available if only streaming warm-up fails. A live/replay
session reserves the worker; concurrent exports report busy rather than building
a hidden backlog. Face loss retires the identity and requires reselection.

The complete degraded debate clip and synchronized listening comparisons are
available under `data/research/clearvoice/results-mps-full/`. Research uses the
official segment trimming schedule; service clip export uses normalized Hann
overlap-add and EOF padding. The research outputs are comparison artifacts, not
new cached service results. Quality remains experimental: shared speech persists
in some overlap intervals. See `../docs/speaker-separation-research.md` for primary
sources, exact timing/memory measurements and the qualified ASR diagnostics.

The root README contains a complete two-terminal startup flow for the integrated trial.

Start the local service from this directory:

```sh
uv run gaze-speaker --device auto
```

It binds only to `127.0.0.1:4033`. The default allowed browser origin is exactly
`http://localhost:4001`; use `--origin` to match a different local frontend port.
`GET /health` reports actual model readiness, selected engine and its device. Missing assets
produce an unready service, never imitation or mixed-audio passthrough output.

Clip uploads accept MP4, MOV, WebM, MKV and AVI, at most 120 MiB and 120 decoded
seconds. MIME declarations are checked before decoding; invalid/missing audio
fails asynchronous analysis. One worker handles analysis and extraction, with at
most two waiting tasks. Sessions expire after 30 idle minutes, and files plus
output reservations share a 1 GiB budget. Metadata is also bounded to 16 clips and
24 extraction jobs per clip. Cancellation discards partial output. Restart clears
unresumable opaque sessions; an exclusive data-directory lease prevents two
service processes from racing cleanup. This service currently supports macOS and
Linux filesystem leases.

`--data-dir` selects the exclusively leased session directory, `--assets` selects
the checksum-pinned checkpoint directory, and `--origin` is the exact allowed
local browser origin. Paths resolve from the launch directory. Keep port 4033 for
the integrated trial; `--port` is available for direct API clients. Preview exports
use H.264/AAC MP4 for all accepted input codecs, padding odd frame dimensions by
one edge pixel. Internal audio timestamp gaps or drift are rejected with a
synchronization error instead of silently collapsing the recording timeline.
Detection occlusion retires the old face identity and requires explicit reselection.

The API uses opaque clip/job IDs and rejects filesystem paths/remote URLs in
requests. `POST /clips` accepts a multipart `file`; poll `GET /clips/{id}` until
ready. Submit `{ "target_id": "…", "generation": 1 }` to
`POST /clips/{id}/extract`, poll `GET /jobs/{id}`, then retrieve `/audio` or
`/preview` only when done. `DELETE /jobs/{id}` cancels; `DELETE /clips/{id}` removes
the whole session. `POST /clips/{id}/regions` accepts a normalized `[x,y,w,h]`
`box` containing exactly one face. Manual correction uses the same mixed audio.

Run real reference extraction and independent evaluation explicitly:

```sh
uv run python -m gaze_speaker.benchmark /absolute/path/to/cnn-debate-low-quality-320x180-15fps.mp4
# Download the two official example URLs listed in gaze_speaker/evaluation.py
# into data/evaluation/sources/grid-{male,female}.mpg first:
uv run python -m gaze_speaker.evaluation
GAZE_MODEL_TESTS=1 GAZE_REFERENCE_TESTS=1 uv run pytest
```

Results and limitations are in `../docs/gaze-speaker-focus-results.md`. Separation
quality is experimental and uneven; do not interpret model inference as guaranteed
clean isolation or mistake clip throughput for a live latency measurement.

Live mode reuses the scene camera and requests a separate mono microphone only
when **Start live microphone** is pressed. USB camera mode requires an alignment check with a clap/visible
speech and video offset; changing source, orientation, dimensions or
offset invalidates that manual check. Arrival-only network sources are rejected even after a manual alignment
check: changing upstream latency cannot be detected from reception timestamps.
Use USB camera mode or a synchronized recording until capture-clock provenance
and a monitored mapping are available. The UI rejects stale frames, more than 150 ms residual skew and clock
discontinuity. Use headphones to avoid microphone feedback. Protocol v3 carries
source sample indices separately from capture-clock spans; old clients are
rejected with a version message. The picture follows current capture, independently of delayed audio. The adaptive reserve uses warmed speed, device latency and recent arrival
variation, grows after an underrun, and has no fixed delay cutoff. It preserves
late valid audio instead of speeding it up or discarding it.

Reference input follows native 1× video playback and continues while inference is busy.
Live microphone capture stops on resource overload, drains already accepted audio
and requires explicit Resume. One live session and one active inference job are allowed; available new audio is batched when the worker is free. Byte limits bound memory independently of playback delay.
Stop/unmount closes microphone, socket and audio context. The shared scene
camera remains owned by its scene session. Clip uploads retain their 120-second
limit; continuous live streams do not inherit it.

With the service running, reproduce actual paced mixed-input replay and a seeded
noise variant (only the original mixture enters inference):

```sh
uv run python -m gaze_speaker.streaming_reference \
  --input ../frontend/apps/web/public/speaker-reference/debate.mp4 \
  --output data/benchmarks/adaptive-streaming/baseline-left \
  --origin http://127.0.0.1:4010 --speaker left
uv run python -m gaze_speaker.noise_fixture \
  --input ../frontend/apps/web/public/speaker-reference/debate.mp4 \
  --output data/benchmarks/adaptive-streaming/seeded-noise.mov
uv run python -m gaze_speaker.streaming_reference \
  --input data/benchmarks/adaptive-streaming/seeded-noise.mov \
  --output data/benchmarks/adaptive-streaming/noisy-left \
  --speaker left
```

The benchmark defaults to an explicit single-person correction region; use
`--automatic-faces` to test full-scene detection. Each report records exact
accepted/output samples, flow and queue history, errors, processing/arrival
measurements, provenance and sampled service RSS with `--server-pid`. Incomplete
runs are marked failed and their unprocessed audio tail is silence, not a claimed
complete result. WAV and aligned preview artifacts permit human A/B listening.
This is synthetic/replay coverage, not physical ESP32 or microphone validation.
See `../docs/gaze-speaker-focus-results.md` for current measurements.

## Stateful environmental-noise suppression

Streaming uses pyrnnoise **0.4.5**, pinned in uv.lock, wrapping RNNoise v0.2.
The wrapper is Apache-2.0; the native RNNoise license is retained in
third_party/rnnoise/COPYING (BSD-style redistribution terms). RNNoise embeds
its weights in the native library; starting a stream never downloads a model.
The macOS wheel requires macOS 26 or newer. Unsupported native platforms fail
explicitly rather than returning mixed audio as focused audio.

The locked universal2 wheel SHA-256 is
8289b32664ac05d3246c1d8e95522f2bec7fd99b29f238a58745e9c2fad47dae.
The tested installed dylib SHA-256 is
b0b0f3c038b8106f04c638596bd8d6594bddaeeaef5db39c5b401de80334efee.
The wrapper repository references RNNoise revision 70f1d25; the wheel's native
binary is tested directly, without claiming a reproducible upstream build.

Continuous 61-tap FIR conversion surrounds 480-sample native frames at 48 kHz.
RNNoise's two-hop 960-sample delay plus the filters' 60-sample delay equals
340 samples at 16 kHz (21.25 ms), compensated in output indices and flushed
at end of input. Irregular chunks preserve duration and phase. A smooth limiter
keeps peaks below 0.98 without normalizing each chunk.

Native validation on the installed clean GRID female fixture with seeded
0.025-RMS white noise measured zero residual sample lag and 0.942 correlation
in the >1.8 kHz consonant band relative to denoised clean speech. Noise-only
suffix RMS was 5.38e-8. This controlled fixture does not establish equivalent
performance for arbitrary noise or physical ESP32 recordings.

Run: uv run pytest tests/test_noise.py tests/test_noise_native.py.


Live input uses a 120 ms minimum supported model shape and 400 ms of retained past
context. It never waits for that history to accumulate. Input is padded to 200 ms
shape increments to reduce repeated GPU shape setup; padding is not future audio.
Common shapes through two seconds are warmed before streaming readiness, with
unused MPS allocator buffers released. Each result emits only new source samples,
with a 10 ms unpublished overlap boundary and continuous RNNoise state. Source EOF
and overload drain accepted audio against a frozen copy of the selected face's
history. Current scene tracking continues independently during overload drain.

The health `window_seconds`/`stride_seconds` fields describe whole-file profiles;
`live_analysis_mode`, `live_minimum_seconds` and `live_history_seconds` describe
streaming. The installed model remains noncausal: available-input scheduling does
not prove subsecond physical microphone-to-headphone latency or perceptual target
separation quality. Benchmark arrival delay excludes browser reserve and physical
hardware delay. Generated `focused-preview.mp4` is a source-aligned listening
comparison, not a recording of realtime playback delay.
