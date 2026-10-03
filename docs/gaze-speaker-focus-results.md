# Speaker-focus measurements

Final branch measurements, 2026-10-03. This report separates processing throughput, playback delay, and speech quality.

Apple M1 Pro, 16 GB unified memory. RTFS-Net four-layer LRS2 checkpoint plus CTCNet visual encoder, 11,926,898 parameters. Actual device: `mps-video/cpu-audio`. Audio runs on CPU; visual encoding runs on MPS. Full MPS is unsupported by the checkpoint's adaptive pooling operations. Model/checkpoint notices are in `speaker-service/README.md` and `third_party/rtfs_net/NOTICE`.

Input: `cnn-debate-low-quality-320x180-15fps.mp4`, SHA-256 `53859a95bade8484604726ca442499bdd6b6c4a64c51efe64180e051af3d9062`. Only this 320×180, 15 fps, CRF34 video and its single original mixed audio stream entered inference. No original higher-resolution frames or Oxford target tracks were used. Three source-derived face tracks were processed; the right face required the explicit normalized region `(0.65,0.08,0.32,0.53)` for continuous coverage.

Each extraction uses 2-second context windows, a 1-second stride, 25 fps nearest source frames, and normalized overlap-add. End padding repeats the last video frame and pads audio with zeros; missing faces inside the real clip fail extraction. Warm-up is separate. Outputs have exactly 510,976 samples at 16 kHz (31.936 seconds).

| Target (left→right) | Manual region | Extraction seconds | Real-time factor | Window p95 seconds |
| --- | --- | --- | --- | --- |
| 1 | False | 24.702 | 0.773 | 0.807 |
| 2 | False | 24.180 | 0.757 | 0.806 |
| 3 | True | 23.738 | 0.743 | 0.766 |

Decode took 0.304s; full clip face analysis took 8.679s; model load took 2.101s and separate warm-up took 1.830s. Peak sampled process RSS was 1.108 GB; final MPS driver allocation was 1.175 GB, reported separately rather than added as a claimed unified-memory peak. These extraction times exclude decode, full-clip analysis, load, warm-up and export. Clip extraction faster than clip duration does not prove live latency; the paced replay below measures the live path.

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
| Source / total wall duration (including drain tail) | 31.936 / 35.204 s |
| Connection and face-preprocessor setup | 0.651 s |
| Actual output | 25 × 1-second chunks across all three phases |
| Inference window median / p95 | 0.758 / 0.917 s |
| First cold model window | 1.982 s |
| Arrival delay from chunk start, p95 / maximum | 3.653 / 3.917 s |
| Maximum waiting model windows | 1 (limit 2) |
| Sampled service process RSS | 1.054 GB |
| Deliberate preview/audio playout delay | 4.000 s |

All accepted chunks arrived before the fixed 4-second deadline, with no growing queue or overload. Warm-up, target-reset gaps and the undrained final overlap tail explain the difference between source duration and output count. The corrected-region change produced its expected explicit pause and required reselection; no older-generation output was accepted. A separate earlier cold-service replay produced 24 chunks, median 0.751s / p95 1.447s, maximum arrival 3.888s and process RSS 0.904 GB, illustrating timing variation. Memory values are sampled process RSS; neither is a complete unified-memory peak including GPU allocations.

This establishes paced local pipeline throughput on this machine for this short fixture. It does not establish sustained hours-long operation, physical ESP32/microphone synchronization, gaze accuracy, or instant listening. Browser playback delays both the listening preview and audio by 4 seconds. Stale frames, discontinuity, residual skew over 150 ms, overload and missed playout deadlines pause focused output. A video-only ESP32 stream needs an explicitly started separate microphone and a checked audiovisual offset; arrival timestamps alone do not prove capture alignment. Live sessions are bounded to 120 seconds.

## Verification and reproduction

The final pre-review frontend run passed **709 tests across 86 files** (0 failures); lint, TypeScript checking and the production build passed. The Python run enabled both real-checkpoint and real-reference tests and passed **80 tests**, with eight known upstream CUDA/TorchScript/profiling/padding warnings. Ruff passed. The production build includes the public `/trial/speaker-focus` route. A fresh whole-branch review follows these checks; any resulting fixes and final counts are recorded in the branch handoff.

Browser testing covered reference loading, local file upload, all three actual model outputs, manual correction, switching/cancellation during processing, source-clock seeking, original/focused playback, WAV/MP4 download, service-loss/restart recovery, responsive layout and keyboard speaker selection. Calibrated scene selection consumes the existing scene camera/calibration lifecycle and has generation, freshness, uncertainty and disposal regression coverage. No physical headset or ESP32 test was performed. The saved browser downloads are actual model outputs, not the reference site's pre-separated demos. Browser sound playback was exercised; an audible quality assessment remains uncertified as stated above.

Follow the root README's two-terminal startup. From `speaker-service`, reproduce clip and live measurements with:

```sh
uv run python -m gaze_speaker.benchmark ../frontend/apps/web/public/speaker-reference/debate.mp4
uv run python -m gaze_speaker.live_benchmark --origin http://127.0.0.1:4010 --server-pid <service-python-pid>
GAZE_MODEL_TESTS=1 GAZE_REFERENCE_TESTS=1 uv run pytest -q
uv run ruff check src tests
```

The live benchmark requires the running local service. Face detector asset SHA-256 is `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`. The separator/config/visual checkpoint SHA-256 values and official download URLs are pinned in `gaze_speaker.assets` and recorded in ignored `data/assets/manifest.json`; the final benchmark report records them again. Complete per-window timings, source/output hashes, tracked observations, WAVs and previews remain local in ignored `speaker-service/data/benchmarks/{debate,live,ui}/`. The reference source is the Oxford project's [mixed CNN debate video](https://www.robots.ox.ac.uk/~vgg/demo/theconversation/demos/cnn2/mix.mp4).
