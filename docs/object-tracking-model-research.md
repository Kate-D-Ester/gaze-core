# Model choice for the LED cosplay viewer

Requirement: an arbitrary clicked/boxed scene example must be found at an unknown location in another camera, not just followed from a known box in one video. No hardware control is included.

| Option | Footprint | Fit for this requirement |
| --- | --- | --- |
| NanoTrack v3 | 1.4 MB backbone + 1.1 MB head ONNX, 541K parameters | Excellent size for following a known box; its source initializes a template and center and searches a crop around the prior center. It does not provide second-camera global acquisition or instance verification. Adding it after acquisition can improve frame rate later, but would add a second tracker and drift handling now. |
| YOLOX nano | 0.91M parameters | Small detector with Apache-2.0 source, trained on COCO's fixed categories. Would need a separate proposal method for glasses/arbitrary examples and separate cross-view matching. |
| ORB + RANSAC only | No neural weights | Fast geometric matching of textured, overlapping views. Cannot propose an object's extent reliably in a new scene and loses plain objects or substantial viewpoint changes. Useful as independent corroboration. |
| YOLOE-26n | Visual model 11,710,443 bytes + prompt-free model 16,271,345 bytes | Visual prompts support an example rectangle instead of a fixed class list. Prompt-free detection makes click selection possible; ORB/RANSAC rejects category-only matches and ambiguous duplicates. Chosen for this version. |

Sources: [NanoTrack author benchmarks](https://github.com/HonglinChu/SiamTrackers/blob/master/NanoTrack/README.md), [NanoTrack search implementation](https://github.com/HonglinChu/SiamTrackers/blob/master/NanoTrack/nanotrack/tracker/nano_tracker.py), [OpenCV TrackerNano interface](https://docs.opencv.org/5.0/main_modules/classcv_1_1TrackerNano.html), [official YOLOX model zoo](https://yolox.readthedocs.io/en/latest/model_zoo.html), [YOLOE modes and visual prompt API](https://docs.ultralytics.com/models/yoloe/). Fit assessments are engineering inferences from those APIs, not cross-camera benchmark claims.

Final Mac/MPS measurement on the bundled bus image: 87 ms median per analyzed frame after fixed-square-input warm-up. Rotated/scaled overlapping views passed; blank and different-scene frames were rejected. This is an inference-stage measurement, not guaranteed camera/display FPS or proof of identity across arbitrary real viewpoints. The UI uses bounded requests and drops intermediate frames. Initial model warm-up happens in the background before readiness.

The displayed >80% match score is the fraction of descriptor correspondences passing RANSAC, with >=8 inliers and coverage/geometry constraints. It is not a calibrated probability of identity. Similar accepted candidates within an 8-point score margin yield Ambiguous. Low texture, blur, small glasses, occlusion and changed 3D viewpoints can remain Searching. Model weights are ~26.7 MiB total; the isolated Python/PyTorch environment is larger. Runtime models and camera frames remain local. See [vision dependency notice](../vision/NOTICE.md).
