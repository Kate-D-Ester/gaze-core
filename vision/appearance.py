"""Conservative dense appearance search for smooth regions without ORB corners.

Normalized correlation is a similarity score, never a probability of identity.
Uniform regions, weak results and similar non-overlapping peaks stay unconfirmed.
"""

import cv2
import numpy as np

from matching import box_overlap


def choose_appearance(reference, image):
    height, width = image.shape[:2]
    reduction = min(1, 480 / max(height, width))
    view_image = cv2.resize(image, (round(width * reduction), round(height * reduction)))
    template = cv2.resize(
        reference.image,
        (
            max(1, round(reference.image.shape[1] * reduction)),
            max(1, round(reference.image.shape[0] * reduction)),
        ),
    )
    gray = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)
    if min(gray.shape) < 20 or gray.std() < 8:
        return {"status": "searching"}
    view_height, view_width = view_image.shape[:2]
    view = cv2.cvtColor(view_image, cv2.COLOR_BGR2GRAY)
    margin_y, margin_x = max(1, gray.shape[0] // 10), max(1, gray.shape[1] // 10)
    mean_color = template[margin_y:-margin_y, margin_x:-margin_x].mean(axis=(0, 1))
    matches = []
    for scale in (0.8, 0.9, 1.0, 1.1, 1.25):
        w, h = round(gray.shape[1] * scale), round(gray.shape[0] * scale)
        if not 25 <= w <= view_width or not 25 <= h <= view_height:
            continue
        resized = cv2.resize(gray, (w, h))
        for angle in (-10, -5, 0, 5, 10):
            rotated = cv2.warpAffine(
                resized,
                cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1),
                (w, h),
                borderValue=float(gray.mean()),
            )
            # Interior detail avoids interpolation/padding at the rotated crop's edge.
            dx, dy = max(1, w // 10), max(1, h // 10)
            detail = rotated[dy:-dy, dx:-dx]
            scores = cv2.matchTemplate(view, detail, cv2.TM_CCOEFF_NORMED)
            scores[~np.isfinite(scores)] = -1
            for _ in range(3):
                _, score, _, (x, y) = cv2.minMaxLoc(scores)
                if score <= 0.92:
                    break
                color = view_image[y : y + detail.shape[0], x : x + detail.shape[1]].mean(
                    axis=(0, 1)
                )
                if np.max(np.abs(color - mean_color)) < 30:
                    matches.append(
                        {
                            "box": [
                                max(0, (x - dx) / view_width),
                                max(0, (y - dy) / view_height),
                                min(1, (x - dx + w) / view_width),
                                min(1, (y - dy + h) / view_height),
                            ],
                            "score": score,
                            "method": "appearance",
                        }
                    )
                scores[
                    max(0, y - h // 2) : min(scores.shape[0], y + h // 2 + 1),
                    max(0, x - w // 2) : min(scores.shape[1], x + w // 2 + 1),
                ] = -1
    matches.sort(key=lambda match: match["score"], reverse=True)
    distinct = []
    for match in matches:
        if not any(box_overlap(match["box"], other["box"]) > 0.5 for other in distinct):
            distinct.append(match)
    if not distinct:
        return {"status": "searching"}
    if len(distinct) > 1 and distinct[0]["score"] - distinct[1]["score"] < 0.08:
        return {"status": "ambiguous"}
    return {"status": "matched", **distinct[0]}
