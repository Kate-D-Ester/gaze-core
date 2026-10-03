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

Full frontend/service startup and reference benchmark instructions are added
with the integrated application.
