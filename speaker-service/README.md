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

AV clip extraction defaults to 3-second windows and 1.8-second stride, using the
service's existing normalized overlap-add and cancellation checks. Live timing
stays at 2-second windows, 1-second stride and 4-second playout delay. Warmed
research inference ranged from 0.97 to 1.26 seconds per live-sized window, with a
4.57-second cold pass; this does **not** establish sustainable realtime operation.
Overload, face loss and stale target generations retain their existing failure
behavior. One model worker is shared by clip and live tasks.

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
and a monitored mapping are available. The UI rejects stale frames, more than 150 ms residual
skew, clock discontinuity, and late audio. Use headphones to avoid microphone
feedback. The listening preview/audio is deliberately delayed **4 seconds**,
including the 2-second model context; it is not instant hearing enhancement.
One live session, one model worker, one CPU face preprocessor, and at most two
waiting inference windows are allowed. Stop/unmount closes its microphone,
WebSocket and audio context while leaving the shared scene camera owned by its
existing scene session.

To reproduce the timestamp-paced, actual mixed-input transport benchmark with the
service running:

```sh
uv run python -m gaze_speaker.live_benchmark --origin http://localhost:4001
```

Generated report/chunks are in `data/benchmarks/live/`. This replay verifies the
local transport/model pipeline; it does not certify ESP32 microphone clocks or
gaze hardware. Model quality and measured throughput remain separate results.
