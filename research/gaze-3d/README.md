# Experimental metric gaze verification

This is offline research tooling, separate from the application and Python vision assistant. It does not process user images or change a live estimator. All inputs below are synthetic. Numerical parity, mathematical projection and desktop timing are separate measurements; none establishes wearer accuracy or mobile FPS.

The browser prototype and model live under `frontend/research/gaze-3d`. Other inactive calibration experiments are under `frontend/research/calibration`; active tracker implementations remain under `frontend/apps/web/src/features`. The frontend type/lint checks include research separately. Docker excludes the research directory, and normal application startup/build does not prepare the prototype runtime.

## Geometry simulation

From the repository root:

```sh
cd frontend
bun test tests/gaze-geometry
bun run tests/gaze-geometry/virtual-report.ts > /tmp/gazecore-virtual-gaze-report.json
```

The independently generated world uses 25 targets on each of two screen planes, 96 combined head poses per target, and distances of 35, 60 and 90 cm. The report includes raw off-screen output and unavailable measurements. Perturbations are declared assumptions, not measured camera noise.

## Original model, conversion and native parity

The pinned public FP32 Intel `gaze-estimation-adas-0002` files are verified against their official SHA-384 checksums before use. Its Apache-2.0 license is retained beside the bundled model. Use Python 3.12 and uv; the commands below create a temporary research environment rather than adding Python inference to the application.

From the repository root:

```sh
GAZE_TOOL_DIR=$(mktemp -d /tmp/gazecore-gaze-conversion.XXXXXX)
uv venv --python 3.12 "$GAZE_TOOL_DIR/venv"
uv pip install --python "$GAZE_TOOL_DIR/venv/bin/python" openvino2onnx==1.1.0 openvino==2025.4.1 onnxruntime==1.22.0 onnx==1.18.0 numpy==2.1.3
uv pip uninstall --python "$GAZE_TOOL_DIR/venv/bin/python" openvino-telemetry
"$GAZE_TOOL_DIR/venv/bin/python" research/gaze-3d/download_model.py "$GAZE_TOOL_DIR"
"$GAZE_TOOL_DIR/venv/bin/openvino2onnx" "$GAZE_TOOL_DIR/gaze-estimation-adas-0002.xml" "$GAZE_TOOL_DIR/model.onnx" --opset-version 19
"$GAZE_TOOL_DIR/venv/bin/python" research/gaze-3d/verify_conversion.py --ir "$GAZE_TOOL_DIR/gaze-estimation-adas-0002.xml" --onnx "$GAZE_TOOL_DIR/model.onnx" --report "$GAZE_TOOL_DIR/conversion-parity.json"
"$GAZE_TOOL_DIR/venv/bin/python" research/gaze-3d/verify_conversion.py --ir "$GAZE_TOOL_DIR/gaze-estimation-adas-0002.xml" --onnx frontend/research/gaze-3d/models/model.onnx --report "$GAZE_TOOL_DIR/bundled-model-parity.json" --browser-reference "$GAZE_TOOL_DIR/model-parity-reference.json"
```

Removing the optional telemetry package prevents the research probe from writing telemetry preferences. All inference uses CPU float32 with one thread. The generator produces 30 original-versus-ONNX cases; 25 deterministic cases also have equivalent browser input generation. Compare the generated browser reference with `frontend/tests/gaze-geometry/model-parity-reference.json` using a JSON-aware comparison (whitespace is irrelevant). Expected values come from the **original IR**, not the converted model.

Conversion graph ordering may change the serialized SHA-256 without changing numerical output. The bundled model is pinned by SHA-256 in `frontend/research/gaze-3d/browser/native-gaze-model.ts` and its NOTICE. Do not overwrite it or change that checksum based only on a successful download; repeat native and browser parity, review provenance and coordinate compatibility first.

## Browser WASM parity and timing

From `frontend`, prepare the optional local runtime and start the isolated probe:

```sh
bun run prepare:gaze-3d
bun run tests/gaze-geometry/serve-browser-probe.ts
```

It serves only an allowlist of synthetic probe/model/runtime assets on `127.0.0.1:4057`. It is not an app route or camera relay. Stop it with Ctrl-C. In a second terminal with Playwright installed in the tooling environment:

```sh
node tests/gaze-geometry/check-browser-probe.cjs > /tmp/gazecore-browser-gaze-report.json
```

The script uses Playwright's Chromium by default. Set `GAZE_PROBE_BROWSER` to an installed Chromium/Chrome executable when necessary. An externally supplied Playwright can be located through Node's `NODE_PATH`; it is not an application dependency. The isolated browser blocks external requests, compares 25 original IR reference outputs, checks concurrent-call/disposal/frame-contract guards and times 100 inferences after five warmups. It closes the browser on success or failure. Timing excludes face detection, head estimation, cropping, rendering and camera acquisition.

## Promotion criteria

The released model/demo and prose disagree about the gaze-vector convention. Raw output therefore remains `model-native-unverified` and cannot enter the physical camera-ray projector. A display-corner test with measured camera intrinsics, optical eye origins, camera/display registration and compatible pose/crop conventions is required before live integration. Near-eye projection additionally needs measured mounting and synchronized physical head pose. RGB weights must not be assumed suitable for IR images. Reprojection stability with exact simulated rays is not an accuracy certification of any of these measurements.
