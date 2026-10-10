"""Download the pinned public Intel model for offline conversion checks."""

import argparse
import hashlib
from pathlib import Path
import urllib.request


MODEL_NAME = "gaze-estimation-adas-0002"
MODEL_BASE_URL = (
    "https://storage.openvinotoolkit.org/repositories/open_model_zoo/"
    f"2023.0/models_bin/1/{MODEL_NAME}/FP32"
)
ARTIFACTS = {
    "xml": (
        68724,
        "2c70fa1448aa923869b96848f1d218ac2efab5f718a57b486d7256c46853726fde71e3165398458e973200612e17529c",
    ),
    "bin": (
        7529380,
        "044e39075331a7e5b3a7da7a39ccc40defda03326375295aa091b273e7395b3ab92db076d7828b9a68795fd496b572c8",
    ),
}


def download_model(destination):
    destination.mkdir(parents=True, exist_ok=True)
    for extension, (expected_size, expected_hash) in ARTIFACTS.items():
        filename = f"{MODEL_NAME}.{extension}"
        with urllib.request.urlopen(
            f"{MODEL_BASE_URL}/{filename}", timeout=60
        ) as response:
            data = response.read(expected_size + 1)
        if (
            len(data) != expected_size
            or hashlib.sha384(data).hexdigest() != expected_hash
        ):
            raise RuntimeError(f"Official model integrity mismatch: {filename}")
        (destination / filename).write_bytes(data)
        print(f"Verified {filename}: {expected_size} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    download_model(parser.parse_args().destination)
