import cv2
import numpy as np
import pytest

from matching import Candidate, Reference, choose_match, valid_box


def textured_image(seed=42):
    random = np.random.default_rng(seed)
    image = np.full((240, 320, 3), 35, np.uint8)
    for _ in range(160):
        x, y = random.integers([20, 20], [300, 220])
        color = tuple(int(c) for c in random.integers(60, 255, 3))
        cv2.circle(image, (int(x), int(y)), int(random.integers(2, 8)), color, -1)
    return image


def test_instance_geometry_matches_translation_and_rejects_unrelated_texture():
    image = textured_image()
    reference = Reference(image, (0.02, 0.02, 0.98, 0.98))
    moved = cv2.warpAffine(image, np.float32([[1, 0, 6], [0, 1, -4]]), (320, 240))
    result = choose_match(reference, moved, [Candidate((0, 0, 1, 1), 0.9)])
    assert result["status"] == "matched"
    assert result["score"] > 0.8
    assert result["inliers"] >= 8
    assert (
        choose_match(reference, textured_image(88), [Candidate((0, 0, 1, 1), 0.9)])["status"]
        == "searching"
    )
    assert (
        choose_match(reference, np.zeros_like(image), [Candidate((0, 0, 1, 1), 0.9)])["status"]
        == "searching"
    )


def test_low_texture_does_not_claim_a_match():
    image = np.full((240, 320, 3), 100, np.uint8)
    result = choose_match(Reference(image, (0, 0, 1, 1)), image, [Candidate((0, 0, 1, 1), 0.9)])
    assert result["status"] == "searching"
    assert "box" not in result


def test_two_equal_instances_are_ambiguous():
    image = textured_image()
    duplicate = np.concatenate([image, image], axis=1)
    result = choose_match(
        Reference(image, (0, 0, 1, 1)),
        duplicate,
        [Candidate((0, 0, 0.5, 1), 0.9), Candidate((0.5, 0, 1, 1), 0.9)],
    )
    assert result["status"] == "ambiguous"
    assert "box" not in result


@pytest.mark.parametrize(
    "box", [(0, 0, 0, 1), (-0.1, 0, 1, 1), (0, 0, float("nan"), 1), (0, 1, 1, 0)]
)
def test_invalid_boxes_rejected(box):
    with pytest.raises(ValueError):
        valid_box(box)
