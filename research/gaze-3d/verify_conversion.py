"""Check original Intel IR versus ONNX; optionally regenerate browser references."""

import argparse
from collections import Counter
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import platform
import statistics
import time

import numpy as np
import onnx
import onnxruntime as ort
import openvino as ov

from synthetic_inputs import HEAD_ANGLES_DEGREES, synthetic_eye_pairs


def benchmark(infer, inputs):
    for _ in range(5):
        infer(inputs)
    durations = []
    for _ in range(100):
        before = time.perf_counter()
        infer(inputs)
        durations.append((time.perf_counter() - before) * 1000)
    return {
        "warmup_runs": 5,
        "timed_runs": 100,
        "median_ms": statistics.median(durations),
        "p95_ms": float(np.percentile(durations, 95)),
        "mean_ms": statistics.mean(durations),
    }


def verify_conversion(ir_path, onnx_path):
    model = onnx.load(onnx_path)
    onnx.checker.check_model(model)
    core = ov.Core()
    compiled = core.compile_model(
        str(ir_path),
        "CPU",
        {
            "INFERENCE_PRECISION_HINT": ov.Type.f32,
            "INFERENCE_NUM_THREADS": 1,
            "NUM_STREAMS": "1",
            "PERFORMANCE_HINT": "LATENCY",
        },
    )
    request = compiled.create_infer_request()
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.log_severity_level = 3
    session = ort.InferenceSession(
        str(onnx_path),
        sess_options=options,
        providers=["CPUExecutionProvider"],
    )

    def infer_ir(inputs):
        output = request.infer(inputs)
        return np.array(next(iter(output.values())), dtype=np.float64).reshape(3).copy()

    def infer_onnx(inputs):
        return session.run(None, inputs)[0].astype(np.float64).reshape(3)

    rows = []
    for crop_name, left, right in synthetic_eye_pairs():
        for angles in HEAD_ANGLES_DEGREES:
            inputs = {
                "left_eye_image": left,
                "right_eye_image": right,
                "head_pose_angles": np.array([angles], dtype=np.float32),
            }
            original = infer_ir(inputs)
            converted = infer_onnx(inputs)
            if not (np.isfinite(original).all() and np.isfinite(converted).all()):
                raise RuntimeError("Non-finite inference output")
            np.testing.assert_allclose(converted, original, rtol=2e-5, atol=2e-6)
            cosine = np.dot(original, converted) / (
                np.linalg.norm(original) * np.linalg.norm(converted)
            )
            angle = math.degrees(math.acos(min(1.0, max(-1.0, float(cosine)))))
            rows.append(
                {
                    "crop": crop_name,
                    "head_pose_degrees": list(angles),
                    "ir": original.tolist(),
                    "onnx": converted.tolist(),
                    "max_absolute_error": float(np.max(np.abs(original - converted))),
                    "angular_difference_degrees": angle,
                }
            )

    benchmark_inputs = {
        "left_eye_image": synthetic_eye_pairs()[4][1],
        "right_eye_image": synthetic_eye_pairs()[4][2],
        "head_pose_angles": np.array([[20, -15, 0]], dtype=np.float32),
    }
    return {
        "evidence": "synthetic-inference-parity-only",
        "accuracyMeasuredOnCamera": False,
        "fpsMeasuredOnPhone": False,
        "versions": {
            name: importlib.metadata.version(name)
            for name in ["openvino2onnx", "openvino", "onnxruntime", "onnx", "numpy"]
        },
        "platform": {
            "python": platform.python_version(),
            "os": platform.platform(),
            "machine": platform.machine(),
        },
        "onnx_bytes": onnx_path.stat().st_size,
        "onnx_sha256": hashlib.sha256(onnx_path.read_bytes()).hexdigest(),
        "onnx_opsets": {entry.domain: entry.version for entry in model.opset_import},
        "onnx_operators": dict(Counter(node.op_type for node in model.graph.node)),
        "cases": len(rows),
        "max_absolute_error": max(row["max_absolute_error"] for row in rows),
        "max_angular_difference_degrees": max(
            row["angular_difference_degrees"] for row in rows
        ),
        "ir_inference": benchmark(infer_ir, benchmark_inputs),
        "onnx_inference": benchmark(infer_onnx, benchmark_inputs),
        "results": rows,
    }


def browser_references(report):
    return [
        {
            "crop": row["crop"],
            "headAnglesDegrees": row["head_pose_degrees"],
            "expectedIrVector": row["ir"],
        }
        for row in report["results"]
        if row["crop"] != "checker_vs_noise"
    ]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ir", required=True, type=Path)
    parser.add_argument("--onnx", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--browser-reference", type=Path)
    arguments = parser.parse_args()
    report = verify_conversion(arguments.ir, arguments.onnx)
    arguments.report.write_text(json.dumps(report, indent=2) + "\n")
    if arguments.browser_reference:
        arguments.browser_reference.write_text(
            json.dumps(browser_references(report), indent=2) + "\n"
        )
    summary = {key: value for key, value in report.items() if key != "results"}
    print(json.dumps(summary, indent=2))
