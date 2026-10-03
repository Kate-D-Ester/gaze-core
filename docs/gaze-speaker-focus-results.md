# Speaker-focus measurements

Initial extraction measurements, 2026-10-03. Transport/UI/live validation will be added as implementation completes.

Apple M1 Pro, 16 GB unified memory. RTFS-Net four-layer LRS2 checkpoint plus CTCNet visual encoder, 11,926,898 parameters. Actual device: `mps-video/cpu-audio`. Audio runs on CPU; visual encoding runs on MPS. Full MPS is unsupported by the checkpoint's adaptive pooling operations. Model/checkpoint notices are in `speaker-service/README.md` and `third_party/rtfs_net/NOTICE`.

Input: `cnn-debate-low-quality-320x180-15fps.mp4`, SHA-256 `53859a95bade8484604726ca442499bdd6b6c4a64c51efe64180e051af3d9062`. Only this 320×180, 15 fps, CRF34 video and its single original mixed audio stream entered inference. No original higher-resolution frames or Oxford target tracks were used. Three source-derived face tracks were processed; the right face required the explicit normalized region `(0.65,0.08,0.32,0.53)` for continuous coverage.

Each extraction uses 2-second context windows, a 1-second stride, 25 fps nearest source frames, and normalized overlap-add. End padding repeats the last video frame and pads audio with zeros; missing faces inside the real clip fail extraction. Warm-up is separate. Outputs have exactly 510,976 samples at 16 kHz (31.936 seconds).

| Target (left→right) | Manual region | Extraction seconds | Real-time factor | Window p95 seconds |
| --- | --- | --- | --- | --- |
| 1 | False | 23.083 | 0.723 | 0.742 |
| 2 | False | 22.960 | 0.719 | 0.750 |
| 3 | True | 23.209 | 0.727 | 0.741 |

Decode took 0.292s; full clip face analysis took 8.741s. Peak sampled process RSS was 1.081 GB; final MPS driver allocation was 1.175 GB, reported separately rather than added as a claimed unified-memory peak. Clip extraction faster than clip duration does not prove live throughput or latency; the paced transport replay remains pending.

Generated WAVs, synchronized MP4 previews, hashes, complete window timings and tracks are in ignored local `speaker-service/data/benchmarks/debate/`. A faster-whisper tiny.en transcription diagnostic is saved alongside them. It gives different transcripts for different targets, but shows substantial cross-speaker content and degraded intelligibility in some intervals. ASR is not a human listening test or an accuracy score. The available tool could not process audio for listening; these previews are prepared for explicit original/focused comparison in the UI. Do not claim clean isolation, perfect background removal, or a verified human listening assessment.

## Independent known-stem evaluation

Two official [GRID examples](https://spandh.dcs.shef.ac.uk/gridcorpus/) were downloaded locally for research evaluation, equalized to 0.1 RMS and mixed into one mono stream. A split-screen 320×180, 15 fps CRF34 video was created, retaining lossless PCM in MOV for exact ground-truth timing. The inference function receives only that mixed video. Separate clean WAVs are accessed only after extraction to compute SI-SDR. Provenance, hashes and preparation code are in `gaze_speaker.evaluation` and ignored `data/evaluation/`.

| Target | Mixture SI-SDR dB | Focused SI-SDR dB | Improvement dB |
| --- | --- | --- | --- |
| male.wav | -0.03 | 1.18 | 1.22 |
| female.wav | -0.03 | 16.33 | 16.36 |

The male target improves only modestly. These two short out-of-domain examples do not establish general quality. The debate has no clean reference stems, so no debate SI-SDR or SNR score is reported. Our five-point canonical alignment differs from the training pipeline's mean-face asset; this and the degraded lip detail can affect quality. The camera proxy does not reproduce ESP32 optics, wide-angle distortion, IR sensitivity or physical microphone synchronization.
