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

The root README contains a complete two-terminal startup flow for the integrated trial.

Start the local service from this directory:

```sh
uv run gaze-speaker --device auto
```

It binds only to `127.0.0.1:4033`. The default allowed browser origin is exactly
`http://localhost:4001`; use `--origin` to match a different local frontend port.
`GET /health` reports actual model readiness and the hybrid device. Missing assets
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
when **Start live microphone** is pressed. Confirm alignment with a clap/visible
speech and set the video offset; changing source, orientation, dimensions or
offset invalidates that manual check. Network arrival time alone is insufficient
proof of capture timing. The UI rejects stale frames, more than 150 ms residual
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
