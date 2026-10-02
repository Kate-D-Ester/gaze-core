# Local RGB tracking sources and limitations

This implementation is a research prototype. RGB tracking uses local MediaPipe
face/iris landmark detection and the actual pretrained WebEyeTrack BlazeGaze
appearance model. It has not been validated for device-specific gaze accuracy,
medical use, accessibility reliance, or commercial deployment. The repository
license does not by itself establish clearance for every training dataset or
third-party model asset; those rights have not been audited here.

## WebEyeTrack

Source: https://github.com/RedForestAI/WebEyeTrack

Pinned source commit: `75fbd2f5f784f2eb3a39675a8dcbf1b01c697f1c`.

The bundled `blazegaze/model.json` and `group1-shard1of1.bin` were copied unchanged
from `js/examples/minimal-example/public/web/` in that commit. The inputs are a
128×512 RGB eye strip normalized to [0,1], a three-dimensional head orientation
vector, and an approximate reconstructed face origin. Outputs use centered
screen coordinates; the application adds 0.5 without clamping or smoothing them.
The head vector is an orientation input, not an ocular gaze ray.

`rgb-features.ts` adapts the upstream `js/src/utils/mathUtils.ts` algorithms for
`obtainEyePatch`, `faceReconstruction`, `computeFaceOrigin3D`, and `getHeadVector`.
It preserves the radial face padding [0.4,0.2], the 512-square projective warp,
the eye band at face landmarks 151/195, nearest-neighbor 512×128 resizing, the
60° perspective assumption, approximate intrinsics fx=fy=image width, 1.2cm iris
diameter assumption, and iterative radial depth refinement. The implementation
samples the final eye strip directly and solves its nonsingular homography with
partial pivoting rather than importing the upstream matrix/SVD dependencies.
It rejects invalid inputs instead of emitting placeholder zeros.

Face-origin inputs are approximate model-compatible geometry, not a calibrated
metric measurement. Head pose reported to the UI/calibration uses rotation from
MediaPipe and observed normalized eye-corner-center position/apparent eye-span
scale. Native MediaPipe MatrixData is column-major. The reported/calibration pose
uses that native layout; the pretrained model inputs separately preserve the
upstream WebEyeTrack row-major interpretation, including its approximate face
scale and head-vector convention. See the primary serialization sources:
https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/framework/formats/matrix_data.proto
and https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/framework/formats/matrix.cc.

The phone and laptop flows share this detection/appearance backbone. They are
separate local feature/calibration paths, not separately trained neural models:
phone features include inverse-distance scale, screen-image translation, head
orientation and gaze/roll interactions to accommodate a handheld camera;
laptop features include gaze/head-angle and image-translation/head-angle
interactions for a camera above a desktop screen. Both retain per-frame iris,
appearance, rotation, translation and scale. Calibration and independent held-out
validation are required. This implementation makes no device-accuracy claim.

Citation: Eduardo Davalos et al., *WEBEYETRACK: Scalable Eye-Tracking for the Browser
via On-Device Few-Shot Personalization*, 2025, https://arxiv.org/abs/2508.19544.

### Upstream MIT license

Copyright (c) 2025 (Eduardo Davalos, Yike Zhang, Amanda Goodwin, Gautam Biswas)

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## MediaPipe and TensorFlow.js

MediaPipe Tasks Vision runtime: `@mediapipe/tasks-vision` 1.0.1 (installed as
`@mediapipe/tasks-vision-remote` to isolate it from the head/hand runtime), Google LLC,
Apache-2.0. The bundled `vision_wasm_module_internal.js` and matching WASM binary
are unchanged copies of that installed package. Runtime model loading uses the
ES-module factory to support browser module workers; GPU delegate initialization
falls back to CPU. Modern OffscreenCanvas and WebAssembly SIMD support are
required for the face runtime (including modern Safari).

MediaPipe Face Landmarker model (float16 revision 1):
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

Official model description and usage:
https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker

TensorFlow.js and WASM runtime: 4.22.0, Google LLC, Apache-2.0. The three
`tfjs-backend-wasm*.wasm` binaries are unchanged copies of
`@tensorflow/tfjs-backend-wasm` 4.22.0. The phone flow prefers single-thread WASM;
the laptop flow prefers WebGL. Each falls back through the remaining backend
and CPU. Cross-origin isolation is not needed for single-thread WASM.

Apache-2.0 license: https://www.apache.org/licenses/LICENSE-2.0

Both runtimes and all models/weight shards are served from the application's own
origin under `/models/remote-eye-tracking/`. No CDN is contacted by inference,
frames are processed on-device, and no training/fine-tuning uploads are made.

## Verification scope

Tests verify landmark/pose geometry, resolution invariance, distinct camera
features, invalid/blink/multiple-face rejection, model-compatible crop geometry,
and actual bundled TensorFlow weight loading and finite appearance-sensitive
predictions. Synthetic fixtures do not establish real-camera accuracy. Browser
and device testing must cover permissions, camera selection, phone orientation,
latency, and held-out target error before relying on tracking results.

## Pinned model checksums (SHA-256)

- Face Landmarker task: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- BlazeGaze model JSON: `a214f074ccd4724cf4ebf008814a05485e7eaa5faf5aaeb85e66b24a1af55688`
- BlazeGaze weight shard: `c030a762a2d21ac0f3c59700a723b2d8790f2003b3f8e72fbe31129fcb234e58`
- MediaPipe module WASM: `2dabd8e23c60984628beb7bb338764c81a08e6837145273f59578684b5d53c1b`
