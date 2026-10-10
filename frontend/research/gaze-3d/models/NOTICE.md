# Experimental 3D gaze model

Intel Open Model Zoo `gaze-estimation-adas-0002`, converted from its official FP32 OpenVINO IR to ONNX opset 19 with openvino2onnx 1.1.0. Original model license: Apache-2.0, reproduced in LICENSE. Conversion changes the serialization/operators, not the trained parameters. No user images or calibration observations are included.

Official model manifest: https://raw.githubusercontent.com/openvinotoolkit/open_model_zoo/master/models/intel/gaze-estimation-adas-0002/model.yml

Original XML SHA-384: `2c70fa1448aa923869b96848f1d218ac2efab5f718a57b486d7256c46853726fde71e3165398458e973200612e17529c`.

Original BIN SHA-384: `044e39075331a7e5b3a7da7a39ccc40defda03326375295aa091b273e7395b3ab92db076d7828b9a68795fd496b572c8`.

Converted ONNX SHA-256: `3ba669723b5e1c7cd1b75e579059f2143b82f0d1bc6c2e6f595f3d171fa1cfdc`.

The optional runtime is Microsoft ONNX Runtime Web 1.22.0, MIT licensed; RUNTIME-LICENSE accompanies the copied runtime. `bun run prepare:gaze-3d` copies its pinned WASM and module locally. Normal application startup does not load this prototype.

The released model/demo and prose disagree about the Z direction. Raw output is deliberately tagged `model-native-unverified`; it is not accepted as a physical camera ray. Conversion parity and synthetic inference timings are not measurements of wearer accuracy or phone FPS. The official reported 6.95-degree MAE does not establish acceptable screen-point precision.

The reproducible download, conversion, original-IR reference generation and isolated browser checks are documented in `research/gaze-3d/README.md` at the repository root. Python inference stays in offline research tooling; the normal application does not use it.
