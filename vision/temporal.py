"""Class-independent NanoTrack following; scores are evidence, not identity probabilities."""

import math
import time

import cv2
import numpy as np

from flow import follow_flow
from matching import box_overlap, crop, valid_box
from nanotrack import NanoTracker


class TemporalTracker:
    def __init__(self, image, box, *, clock=time.monotonic, factory=NanoTracker, flow=follow_flow):
        self.clock = clock
        self.last_seen = clock()
        self.shape = image.shape
        self.misses = 0
        self.active = True
        height, width = image.shape[:2]
        x1, y1, x2, y2 = valid_box(box)
        pixels = (
            round(x1 * width),
            round(y1 * height),
            max(1, round((x2 - x1) * width)),
            max(1, round((y2 - y1) * height)),
        )
        self.flow = flow
        self.factory = factory
        self.previous = image.copy()
        self.box = [x1, y1, x2, y2]
        self.tracker = factory()
        self.tracker.init(image, pixels)

    def miss(self):
        self.misses += 1
        if self.misses >= 3:
            self.active = False
        return {"status": "searching"}

    def update(self, image):
        now = self.clock()
        if not self.active:
            return {"status": "searching"}
        if image.shape != self.shape or now - self.last_seen > 1 or image.std() < 2:
            self.active = False
            return {"status": "searching"}
        self.last_seen = now
        ok, pixels = self.tracker.update(image)
        score = float(self.tracker.getTrackingScore())
        height, width = image.shape[:2]
        x, y, w, h = pixels
        box = [
            max(0, x / width),
            max(0, y / height),
            min(1, (x + w) / width),
            min(1, (y + h) / height),
        ]
        if (
            not ok
            or not math.isfinite(score)
            or not 0.8 < score <= 1
            or w < 4
            or h < 4
            or box[0] >= box[2]
            or box[1] >= box[3]
        ):
            return self.miss()
        motion = self.flow(self.previous, image, self.box)
        if motion is not None and box_overlap(box, motion["box"]) < 0.4:
            return self.miss()
        if motion is not None:
            box = motion["box"]
            score = min(score, motion["score"])
            pixels = (
                round(box[0] * width),
                round(box[1] * height),
                round((box[2] - box[0]) * width),
                round((box[3] - box[1]) * height),
            )
        previous_patch = cv2.cvtColor(
            cv2.resize(crop(self.previous, self.box), (48, 48)), cv2.COLOR_BGR2GRAY
        ).astype(float)
        current_patch = cv2.cvtColor(
            cv2.resize(crop(image, box), (48, 48)), cv2.COLOR_BGR2GRAY
        ).astype(float)
        old_contrast, contrast = previous_patch.std(), current_patch.std()
        if old_contrast >= 8:
            similarity = float(
                np.mean(
                    (previous_patch - previous_patch.mean())
                    * (current_patch - current_patch.mean())
                )
                / max(old_contrast * contrast, 1e-6)
            )
            plausible = contrast >= max(2, old_contrast * 0.25) and similarity >= 0.25
        else:
            similarity = 0
            plausible = abs(previous_patch.mean() - current_patch.mean()) <= 35
        # A high neural score can persist on an empty background or another part.
        # Strong local appearance is enough; weaker evidence needs reverse motion.
        if plausible and motion is None and similarity < 0.65:
            reverse = self.factory()
            reverse.init(image, pixels)
            reverse_ok, reverse_pixels = reverse.update(self.previous)
            rx, ry, rw, rh = reverse_pixels
            recovered = [rx / width, ry / height, (rx + rw) / width, (ry + rh) / height]
            reverse_score = float(reverse.getTrackingScore())
            plausible = (
                reverse_ok
                and math.isfinite(reverse_score)
                and 0.8 < reverse_score <= 1
                and box_overlap(self.box, recovered) >= 0.5
            )
        if not plausible:
            return self.miss()
        self.misses = 0
        self.box = box
        self.previous = image.copy()
        if motion is not None:
            self.tracker.init(image, pixels)
            return {
                "status": "matched",
                "box": box,
                "score": score,
                "method": "flow",
                "inliers": motion["inliers"],
            }
        return {"status": "matched", "box": box, "score": score, "method": "temporal"}
