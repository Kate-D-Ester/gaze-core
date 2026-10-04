"""Instance corroboration; detector category confidence alone is never a match."""

import math
from dataclasses import dataclass

import cv2
import numpy as np

Box = tuple[float, float, float, float]


def valid_box(value) -> Box:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise ValueError("Choose a valid object rectangle.")
    if any(
        isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x)
        for x in value
    ):
        raise ValueError("Choose a valid object rectangle.")
    x1, y1, x2, y2 = value
    if not 0 <= x1 < x2 <= 1 or not 0 <= y1 < y2 <= 1:
        raise ValueError("Choose a valid object rectangle.")
    return tuple(float(x) for x in value)


def crop(image, box: Box):
    height, width = image.shape[:2]
    x1, y1, x2, y2 = box
    roi = image[
        int(y1 * height) : max(int(y2 * height), int(y1 * height) + 1),
        int(x1 * width) : max(int(x2 * width), int(x1 * width) + 1),
    ]
    scale = 400 / max(roi.shape[:2])
    return cv2.resize(
        roi, (max(1, round(roi.shape[1] * scale)), max(1, round(roi.shape[0] * scale)))
    )


@dataclass(frozen=True)
class Candidate:
    box: Box
    confidence: float


class Reference:
    def __init__(self, image, box: Box):
        self.image = crop(image, valid_box(box))
        self.orb = cv2.ORB_create(nfeatures=1500, fastThreshold=10, edgeThreshold=12)
        self.points, self.descriptors = self.orb.detectAndCompute(self.image, None)

    def compare(self, image, candidate: Candidate):
        if self.descriptors is None or len(self.points) < 8:
            return None
        target = crop(image, valid_box(candidate.box))
        points, descriptors = self.orb.detectAndCompute(target, None)
        if descriptors is None or len(points) < 8:
            return None
        pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(self.descriptors, descriptors, k=2)
        good = [
            pair[0]
            for pair in pairs
            if len(pair) == 2 and pair[0].distance < 0.7 * pair[1].distance
        ]
        # One destination feature cannot corroborate multiple reference features.
        unique = {}
        for match in sorted(good, key=lambda item: item.distance):
            unique.setdefault(match.trainIdx, match)
        good = list(unique.values())
        if len(good) < 8:
            return None
        source_points = np.float32([self.points[m.queryIdx].pt for m in good])
        target_points = np.float32([points[m.trainIdx].pt for m in good])
        homography, mask = cv2.findHomography(source_points, target_points, cv2.RANSAC, 4.0)
        if homography is None or mask is None or not np.isfinite(homography).all():
            return None
        accepted = mask.ravel().astype(bool)
        inliers = int(accepted.sum())
        score = inliers / len(good)
        if inliers < 8 or score <= 0.80:
            return None
        height, width = self.image.shape[:2]
        coverage = cv2.contourArea(cv2.convexHull(source_points[accepted])) / (width * height)
        if coverage < 0.10:
            return None
        corners = np.float32([[0, 0], [width, 0], [width, height], [0, height]]).reshape(-1, 1, 2)
        projected = cv2.perspectiveTransform(corners, homography)
        target_area = target.shape[0] * target.shape[1]
        area = cv2.contourArea(projected)
        if (
            not np.isfinite(projected).all()
            or not cv2.isContourConvex(projected)
            or not 0.2 * target_area < area < 4 * target_area
        ):
            return None
        return {
            "box": list(candidate.box),
            "score": score,
            "inliers": inliers,
            "detectionConfidence": candidate.confidence,
        }


def choose_match(reference: Reference, image, candidates: list[Candidate]):
    matches = [
        result for candidate in candidates if (result := reference.compare(image, candidate))
    ]
    matches.sort(key=lambda result: result["score"], reverse=True)
    if not matches:
        return {"status": "searching"}
    if len(matches) > 1 and matches[0]["score"] - matches[1]["score"] < 0.08:
        return {"status": "ambiguous"}
    return {"status": "matched", **matches[0]}
