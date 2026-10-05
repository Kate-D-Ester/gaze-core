# Model choice for the LED cosplay viewer

Requirement: an arbitrary clicked/boxed scene example must be found at an unknown location in another camera, not just followed from a known box in one video. No hardware control is included.

| Option | Footprint | Fit for this requirement |
| --- | --- | --- |
| NanoTrack v3 | 1.4 MB backbone + 1.1 MB head ONNX, 541K parameters | Small footprint for following a known box; its source initializes a template and center and searches a crop around the prior center. It does not provide second-camera global acquisition or instance verification. Chosen for following an acquired region in both views. Fine parts also need feature-motion and appearance checks to reject drift. |
| YOLOX nano | 0.91M parameters | Small detector with Apache-2.0 source, trained on COCO's fixed categories. Would need a separate proposal method for glasses/arbitrary examples and separate cross-view matching. |
| ORB + RANSAC only | No neural weights | Fast geometric matching of textured, overlapping views. Cannot propose an object's extent reliably in a new scene and loses plain objects or substantial viewpoint changes. Useful as independent corroboration. |
| YOLOE-26n | Visual model 11,710,443 bytes + prompt-free model 16,271,345 bytes | Visual prompts support an example rectangle instead of a fixed class list. Prompt-free detection makes click selection possible; ORB/RANSAC rejects category-only matches and ambiguous duplicates. Retained for click selection and acquisition proposals; it is not the continuous tracker. |

Sources: [NanoTrack author benchmarks](https://github.com/HonglinChu/SiamTrackers/blob/master/NanoTrack/README.md), [NanoTrack search implementation](https://github.com/HonglinChu/SiamTrackers/blob/master/NanoTrack/nanotrack/tracker/nano_tracker.py), [OpenCV TrackerNano interface](https://docs.opencv.org/4.x/d8/d69/classcv_1_1TrackerNano.html), [official YOLOX model zoo](https://yolox.readthedocs.io/en/latest/model_zoo.html), [YOLOE modes and visual prompt API](https://docs.ultralytics.com/models/yoloe/). Fit assessments are engineering inferences from those APIs, not cross-camera benchmark claims.

Earlier acquisition-only Mac/MPS measurement on the bundled bus image: 87 ms median per analyzed frame after fixed-square-input warm-up. Rotated/scaled overlapping views passed; blank and different-scene frames were rejected. This is an inference-stage measurement, not guaranteed camera/display FPS or proof of identity across arbitrary real viewpoints. The UI uses bounded requests and drops intermediate frames. Initial model warm-up happens in the background before readiness.

The displayed >80% match score is the fraction of descriptor correspondences passing RANSAC, with >=8 inliers and coverage/geometry constraints. It is not a calibrated probability of identity. Similar accepted candidates within an 8-point score margin yield Ambiguous. Low texture, blur, small glasses, occlusion and changed 3D viewpoints can remain Searching. The original YOLOE model weights are ~26.7 MiB total; the isolated Python/PyTorch environment is larger. Runtime models and camera frames remain local. See [vision dependency notice](../vision/NOTICE.md).


## Continuous regions and local video evaluation

This branch now uses NanoTrack v3 for motion in each view. Its two ONNX files total 2,615,375 bytes. The native decoder uses the upstream 15×15 response map; the packaged TrackerNano interface assumed a different response shape. Shape/finiteness checks and deterministic decoder tests cover this adaptation.

For detailed regions, [OpenCV Lucas–Kanade flow](https://docs.opencv.org/4.x/d4/dee/tutorial_optical_flow.html) supplies a corroborating motion estimate: forward/backward error, feature coverage, at least eight inliers, >80% geometric consistency, bounded scale change and agreement with NanoTrack are required. Weak local appearance requires reverse tracking; collapsing contrast or incompatible appearance removes the box. Original reference crops remain available for reacquisition.

Acquisition first checks global ORB geometry, including exclusion of a second plausible instance. A single <=480px interior appearance search per request can match smooth regions with >92% correlation and tonal agreement. Similar distinct peaks stay Ambiguous. YOLOE proposals remain a fallback, with five candidates and a 250ms soft budget checked between stages. This budget bounds repeated work; it cannot interrupt an individual native/model call. Scores remain algorithm evidence, never a calibrated probability of identity.

The local evaluator runs each supplied region independently and reports hand-reviewed checkpoint IoU, missing boxes, visibility, and timing. It also generates annotated clips. Its Target image is a slightly rotated/scaled/translated copy of the same frame. This checks overlapping views; an independently recorded second camera is required to measure real cross-camera accuracy. Private media, truth boxes and results stay under ignored .local-reference, outside versioned source.


## Motion acceptance result (2026-10-05)

The six independently initialized cases on the supplied local recording were run sequentially at a 15 Hz video cadence. At 49 sparse, hand-reviewed checkpoints (including known initialization), IoU >=0.5 successes were: face 12/14 Scene and 11/14 synthetic Target; specs 4/12 and 5/12; clothing 4/8 and 7/8; open-hand initialization 1/7 and 1/7; closed-hand initialization 1/4 and 1/4; phone 3/4 and 3/4. Missing boxes count as failures. Hands include open/closed posture transitions. **This fails the requested reliable hand/specs and arbitrary-object accuracy; high evidence scores did not guarantee correct region extent.** No production accuracy claim is warranted. Private annotations, clips and the detailed report remain ignored under .local-reference/motion-tests/continuous-final-v9.

[OpenCV ViTTrack](https://github.com/opencv/opencv_zoo/tree/47534e27c9851bb1128ccc0102f1145e27f23f98/models/object_tracking_vittrack) was also evaluated locally. The full ONNX file is 714,726 bytes (official LFS SHA256 2990f0b7cd44d92afa48cd97db6de7be113fc1d9594fddb74e2725c10478e91d). Its [native API](https://docs.opencv.org/4.x/d9/d26/classcv_1_1TrackerVit.html) defaults to a 0.2 response threshold. The >0.8 probe lost almost all regions; the native-threshold probe remained poor on specs/clothing/hands. It was rejected for this implementation. Model response thresholds across trackers are not interchangeable or calibrated identity probabilities.

The final public-image smoke check passed acquisition at 0/5/15-degree transforms, rejected blank/unrelated frames, and kept Scene active for 12 fresh nonmatching Target pairs (maximum 147.9 ms). Real-video pair median/p95 ranged from 42.5/295.6 ms for phone to 311.5/345.7 ms for specs while reacquiring. These timings exclude capture/encoding/transport/rendering and do not establish live FPS. The Target video test uses transformed same-frame copies, so real independent camera accuracy remains unmeasured.
