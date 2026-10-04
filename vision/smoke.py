"""Real-model acceptance check using only the upstream bundled public image."""

import statistics
import time
from pathlib import Path

import cv2
import numpy as np

from engine import VisionEngine


def main():
    import ultralytics  # Engine import above sets local/offline paths first.

    path = Path(ultralytics.__file__).parent / "assets" / "bus.jpg"
    image = cv2.resize(cv2.imread(str(path)), (600, 800))
    engine = VisionEngine()
    selected = engine.select(image, [0.5, 0.35], None)
    print("Selected:", selected["label"], selected["box"], flush=True)
    assert selected["label"] and selected["box"][0] <= 0.5 <= selected["box"][2]
    times = []
    for angle in (0, 5, 15):
        transformed = cv2.warpAffine(
            image, cv2.getRotationMatrix2D((300, 400), angle, 0.95), (600, 800)
        )
        start = time.monotonic()
        match = engine.match(selected["token"], transformed)
        times.append(time.monotonic() - start)
        assert match["status"] == "matched", (angle, match)
        assert match["score"] > 0.8 and match["inliers"] >= 8
        print(f"Rotation {angle}: {match['score']:.3f} match score, {match['inliers']} inliers")
    assert engine.match(selected["token"], np.zeros_like(image))["status"] == "searching"
    # Another scene with people must not count as the selected bus instance.
    other = cv2.imread(str(path.with_name("zidane.jpg")))
    assert engine.match(selected["token"], other)["status"] == "searching"
    engine.clear(selected["token"])
    assert not engine.sessions.items and engine.visual.predictor is None
    print(
        f"Real inference passed; device={engine.device}, median={statistics.median(times) * 1000:.1f}ms"
    )


if __name__ == "__main__":
    main()
