# Local speaker separation evaluation

AV-MossFormer2 is a practical **opt-in experimental engine** on this Apple Silicon Mac. It loads official pretrained weights safely, produces different outputs for different visible targets, and runs faster than the clip duration with the official 3-second / 1.8-second schedule. Evidence does not justify declaring clean isolation or changing the RTFS default: late overlap still contains shared speech, and no human listening assessment or clean reference stems are available.

## Model and provenance

[ClearerVoice-Studio](https://github.com/modelscope/ClearerVoice-Studio) provides audio-visual target extraction; [official AV-MossFormer2 weights](https://huggingface.co/alibabasglab/AV_MossFormer2_TSE_16K) are ungated and marked Apache-2.0. Code revision `6b3774dc79c46ae8bed2a4fa5f706f0ac8c75c61`; weight revision `f168d2502161cf7ef5d55872d5f01f89e88e4c2e`. `last_best_checkpoint.pt` is 734,561,014 bytes, including training optimizer state; SHA-256 `0e60209aab0b31c38deea4ab116100acbbf3a07db8bc559f796f118da1a767d5`. Safe `torch.load(weights_only=True, mmap=True)` succeeded, with strict learned-state loading and 68,516,407 parameters. Selected source was inspected and imported directly; the full repository CLI and unsafe pickle loader were not executed.

The [Interspeech 2025 paper](https://www.isca-archive.org/interspeech_2025/zhao25f_interspeech.pdf) describes training with Grid, TCD-Timit, LRS2/3, VoxCeleb2 and MISP plus FSD50K/WHAM/MUSAN noise. It reports 68.5M parameters and VoxCeleb2 SI-SNR improvements of 14.6 dB on two-speaker and 15.5 dB on three-speaker mixtures. These are the authors’ benchmark results, not scores for Kate’s clip.

[Official preprocessing](https://github.com/modelscope/ClearerVoice-Studio/blob/6b3774dc79c46ae8bed2a4fa5f706f0ac8c75c61/clearvoice/clearvoice/utils/video_process.py) expands a smoothed face bounding box downward, resizes to 224x224, takes its central 112x112 grayscale patch, and normalizes with mean 0.4161 / standard deviation 0.1688 at 25 fps. The model expects mono 16 kHz audio. This differs from RTFS’s aligned 88x88 mouth crops; resizing already prepared RTFS crops is not an equivalent input. The decoder required a portability patch replacing a hard-coded `.cuda()` index with an index on the signal’s device. An unused torchaudio import was removed. Learned layers and weights were unchanged. Preserve Apache license and the visual frontend’s MIT-derived notices when vendoring.

## Measured local results

Host: arm64 Mac, macOS 27.0, 8 logical CPUs, 16 GiB RAM; Torch 2.14.1; four CPU threads. The source is the actual 31.936-second, 320x180, 15 fps mono degraded debate clip. Existing tracked face boxes were reused; the right face was obtained from the explicit region `[0.65,0.08,0.32,0.53]`. Resampling video to 25 fps repeats frames and cannot restore missing lip information. Face tracking was not timed again. Preparation of the complete clip’s candidate face patches took about 0.49 seconds.

| Schedule | Measured inference | Practical limit |
|---|---:|---|
| CPU, 2-second window, left/right, three repetitions each | 8.92–9.75 s/window | Far too slow for live use |
| MPS, 2-second window | First call 4.574 s; later calls 0.974–1.261 s | A 1-second stride has insufficient reliable headroom |
| MPS, complete left target, 3-second window / 1.8-second stride | 18 windows; 27.656 s total; median 1.440 s; first 3.094 s | One warmed active target can keep up in this isolated test |
| MPS, complete right target, same schedule | 18 windows; 25.811 s total; median 1.422 s; range 1.384–1.584 s | Several seconds of context/processing delay; concurrent browser load unmeasured |

CPU process peak RSS was 1,336,328,192 bytes. MPS complete-clip process peak RSS was 1,081,901,056 bytes; final MPS driver allocation was 1,438,171,136 bytes (an endpoint measurement, **not** GPU peak memory). CPU/MPS 2-second waveform maximum absolute differences were 2.09e-7 and 1.71e-7 for left/right. Outputs were finite and preserved PCM length. No claim of sustained realtime operation follows from these isolated timings.

## Conditioning and overlap caveats

Both targets received identical mixed audio; only the face video changed. Their waveform correlations differ on the same intervals:

| Interval | Candidate left/right correlation | RTFS left/right correlation |
|---|---:|---:|
| 0–10 s | 0.120 | 0.487 |
| 10–18 s | 0.262 | 0.657 |
| 19–27 s | 0.271 | 0.406 |

These numbers demonstrate different conditioned outputs and common signal content, not correct voice identity or perceptual quality. At 28–31.936 seconds the candidate right output RMS was 0.0096, versus RTFS right 0.0466 and candidate left 0.0713; lower energy alone does not prove appropriate suppression.

A local `faster-whisper` 1.2.1 `tiny.en` int8 diagnostic, with the same decoder settings across mixture/candidate/RTFS, recovered different early narratives for the candidate’s two targets. Candidate left contained the nationalists/racists discussion; candidate right contained the “under no circumstances” / decorum discussion. The RTFS diagnostic was more fragmented. However, both candidate tracks retain common moderator phrases around 19–27 seconds, including “hey look” and “you can disagree.” ASR can hallucinate, and these observations are tentative leakage/intelligibility clues, not a listening assessment, word-error score, or adoption verdict. There are no stems to compute meaningful SI-SDR, PESQ or STOI for this clip.

Direct A/B artifacts, at original amplitude scale without peak boosting:

- Candidate left: `speaker-service/data/research/clearvoice/results-mps-full/left-preview.mp4` and `target-0.wav`.
- Candidate right: `speaker-service/data/research/clearvoice/results-mps-full/right-preview.mp4` and `target-2.wav`.
- Original: `speaker-service/data/research/clearvoice/results-mps-full/mixture.wav` and the provided degraded clip.
- Existing RTFS: `speaker-service/data/benchmarks/debate/target-{1,3}/preview.mp4`.

The candidate previews use H264 / AAC, 320x180 at 15 fps, with audio and video starting at zero. Compare 0–10, 10–18 and 19–27 seconds, including target presence, shared moderator speech, missing syllables, artifacts and gain. Keep RTFS as default while making the candidate explicitly selectable for this comparison.

## Alternatives and integration recommendation

| Component | Reusable capability | Fit for this app |
|---|---|---|
| [SpeechBrain SepFormer WSJ0-3Mix](https://huggingface.co/speechbrain/sepformer-wsj03mix) | Public Apache-2.0 pretrained mono 8 kHz three-output separator | Needs output-to-face association and permutation stability; cannot directly pick a visible target |
| [SAM-Audio](https://github.com/facebookresearch/sam-audio) | Target/residual separation from text, visual masks or time prompts | Official checkpoints require approved authenticated access; CUDA recommended; custom SAM license; untested here |
| [LookOnceToHear](https://github.com/vb000/LookOnceToHear) and [paper](https://arxiv.org/abs/2405.06289) | Local realtime target hearing with noisy enrollment | Uses binaural enrollment and spatial cues; does not directly replace a mono webcam/lip-conditioned separator |
| [pyannote.audio](https://github.com/pyannote/pyannote-audio) | Diarization, activity/overlap detection and embeddings | Supporting metadata, not a target PCM isolation engine |
| [Silero VAD](https://github.com/snakers4/silero-vad) | Local speech activity detection | Can gate silence; cannot remove another simultaneous speaker |

Minimal candidate inference boundary: `extract(mixed_pcm: float32[N], prepared_face_frames: float32[round(N/16000*25),112,112]) -> float32[N]`. Validate dimensions, timing and finite values; preserve gain after normalization. Load one verified model explicitly, keep one inference worker, use engine-specific preprocessing in both clip and live paths, and preserve existing face-loss/generation/cancellation protections. Do not implicitly download weights. Prefer 3-second / 1.8-second clip scheduling; fixed live 2-second / 1-second scheduling remains experimental and must not be advertised as sustainable realtime.

## Reproduction

All research files are isolated in ignored `speaker-service/data/research/`; no original checkout files were changed. The research environment contains only the missing `rotary-embedding-torch==0.8.3` dependency and reads Torch/OpenCV/etc from the service environment. From the feature worktree’s `speaker-service` directory:

```sh
PYTHONPATH=.venv/lib/python3.12/site-packages data/research/clearvoice/.venv/bin/python data/research/clearvoice/probe.py --device cpu --seconds 2 --repeats 3 --targets 0,2
PYTHONPATH=.venv/lib/python3.12/site-packages data/research/clearvoice/.venv/bin/python data/research/clearvoice/probe.py --device mps --seconds 2 --repeats 3 --targets 0,2
PYTHONPATH=.venv/lib/python3.12/site-packages data/research/clearvoice/.venv/bin/python data/research/clearvoice/probe.py --device mps --full --targets 0,2
HF_HUB_OFFLINE=1 data/research/asr-env/bin/python data/research/clearvoice/asr_diagnostic.py
PYTHONPATH=.venv/lib/python3.12/site-packages data/research/clearvoice/.venv/bin/python data/research/clearvoice/overlap_diagnostics.py
```

Apple GPU access requires an unsandboxed process on this host. Complete window timings, input arrays, saved outputs, `asr-diagnostic.json`, `overlap-diagnostics.json`, `signal-diagnostics.json`, source pin and `sha256-manifest.json` are under `speaker-service/data/research/clearvoice/`. The ASR model uses the existing local cached snapshot, with no media upload. Its diagnostic explicitly decodes PCM through FFmpeg because the independently installed latest PyAV API was incompatible with faster-whisper’s filename decoder.

## Opt-in service integration and verification

The feature worktree now includes an explicit `rtfs` / `av-mossformer2` service
selector, with RTFS retained as the default. AV assets are staged in ignored
`speaker-service/data/av-assets/`, verified against the official hash above. No
weights enter Git and model loading performs no downloads. The asset setup CLI
can download the pinned revision or reuse a local checkpoint only after verifying
its copied bytes. The safe loader maps the AV training checkpoint instead of
materializing its unused optimizer state.

From `speaker-service/`:

```sh
uv sync --frozen
uv run python -m gaze_speaker.assets --engine av-mossformer2 --dir data/av-assets \
  --checkpoint data/research/clearvoice/last_best_checkpoint.pt
uv run gaze-speaker --engine av-mossformer2 --assets data/av-assets --device auto \
  --origin http://127.0.0.1:4010
GAZE_AV_MODEL_TESTS=1 uv run pytest tests/test_av_model.py
uv run ruff check src tests
uv run pytest
```

Both clip and live paths call the same engine-specific preparation boundary.
AV clip defaults are 3 seconds / 1.8 seconds; RTFS defaults remain 2 seconds /
1 second. Live timing remains 2 seconds / 1 second / 4-second delay. The service
retains normalized Hann overlap-add and EOF padding, whereas the research probe
uses official central segment trimming; production exports are therefore not
claimed identical to the research comparison waveforms.

Test-first evidence: 17 missing-feature failures before implementation; additional
RED checks exposed missing memory mapping and float32 overflow rejection. These
contracts became green along with face-loss/EOF, crop exactness, local checkpoint
verification, engine dispatch, CLI settings, live generation discard, output
shape/finite checks, gain restoration and clip schedule tests. Independent verification enabled all real-model and reference checks: the complete
service suite passed **111 tests in 34.11 seconds**, including the actual MPS AV
checkpoint. Ruff passed for service source/tests. The combined feature launcher
was also checked with the AV engine: frontend on 4010, dedicated relay on 4023,
and local speech service on 4033; stopping it released only those feature services
and preserved the original v3 relay.

Final browser integration used the same 31.936-second degraded debate through the
actual app and production AV engine. Speaker 1 completed in **25.175 seconds**, with
**1.683 seconds p95 per window** on MPS. Original video remained playing and
unmuted while extraction was pending; completed focused playback and Original /
Focused switching worked, and automatic EOF rewind preserved the target/job.
The saved production output is under ignored
`speaker-service/data/benchmarks/integration/reference-focused-preview.mp4`, with
its WAV, job metadata and `reference-ready.png`. This verifies the clip workflow,
not physical gaze calibration, listening quality or sustained live throughput.
The final frontend suite passed **763 tests**, lint/typecheck/production build
passed, and independent frontend/backend reviews had no remaining findings.
