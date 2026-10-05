"""Cross-camera policy tests; model accuracy uses the private supplied clip."""

from types import SimpleNamespace

import cv2
import numpy as np
from test_memory_tracking import SegmentationBoundary

from engine import VisionEngine
from sessions import Sessions


def setup_case(color=(160, 55, 15)):
    patch = np.full((64, 32, 3), color, np.uint8)
    patch[:14] = (220, 225, 225)
    for x in (7, 15, 23):
        patch[18:, x : x + 2] = np.array(color) * 0.65
    scene = np.full((180, 240, 3), 90, np.uint8)
    scene[60:124, 80:112] = np.uint8(cv2.GaussianBlur(patch, (0, 0), 2.5) * 0.5 + 30)
    target = np.full((360, 480, 3), 35, np.uint8)
    target[100:292, 260:356] = cv2.resize(patch, (96, 192))
    source_box = [80 / 240, 60 / 180, 112 / 240, 124 / 180]
    target_box = [260 / 480, 100 / 360, 356 / 480, 292 / 360]
    backend = SegmentationBoundary([(source_box, 0.99, 0.95)] + [(target_box, 0.99, 0.95)] * 8)
    backend.similarity = lambda *args: 0.9

    class Box:
        xyxy = np.array([[260, 100, 356, 292]], np.float32)
        conf = np.array([0.7], np.float32)

    class Tensor:
        def __init__(self, array):
            self.array = array

        def cpu(self):
            return self

        def tolist(self):
            return self.array.tolist()

    proposal = SimpleNamespace(xyxy=[Tensor(Box.xyxy[0])], conf=Box.conf)
    model = SimpleNamespace(pe=SimpleNamespace(detach=lambda: SimpleNamespace(clone=lambda: None)))
    engine = VisionEngine.__new__(VisionEngine)
    engine.segmentation = backend
    engine.appearance = SimpleNamespace(score=lambda *args: 0.9)
    engine.visual = SimpleNamespace(
        model=model, predict=lambda *args, **kwargs: [SimpleNamespace(boxes=[proposal])]
    )
    engine.options = {}
    engine.sessions = Sessions()
    token = engine.select(scene, None, source_box)["token"]
    return engine, token, scene, target, target_box


def test_different_camera_quality_can_acquire_without_a_target_rectangle():
    engine, token, _, target, target_box = setup_case()
    original = engine.sessions.get(token)["reference"]
    assert engine.match(token, target)["status"] != "matched"
    result = engine.match(token, target)
    assert result["status"] == "matched"
    assert np.allclose(result["box"], target_box)
    assert "acquisition" not in result
    assert engine.sessions.get(token)["target"].reference is original


def test_another_coloured_case_cannot_pass_on_high_model_scores():
    engine, token, _, target, _ = setup_case()
    target[142:292, 260:356] = (15, 55, 160)
    for _ in range(3):
        assert engine.match(token, target)["status"] != "matched"
    assert engine.sessions.get(token)["target"] is None


def test_malformed_mask_clears_confirmation_before_another_valid_observation():
    from collections import deque

    from matching import Candidate

    engine, token, _, target, box = setup_case()
    acquisition = engine.sessions.get(token)["cross_acquisition"]
    engine.segmentation.predictions = deque(
        [(box, 0.99, 0.95), ([0.5, 0.2], 0.99, 0.95), (box, 0.99, 0.95), (box, 0.99, 0.95)]
    )
    candidates = [Candidate(tuple(box), 0.7)]
    assert acquisition.update(target, candidates, float("inf"))["status"] == "searching"
    assert acquisition.update(target, candidates, float("inf"))["status"] == "searching"
    assert acquisition.update(target, candidates, float("inf"))["status"] == "searching"
    assert acquisition.update(target, candidates, float("inf"))["status"] == "matched"


def test_acquisition_budget_exhaustion_discards_confirmation(monkeypatch):
    import engine as module
    from matching import Candidate

    engine, token, _, target, box = setup_case()
    acquisition = engine.sessions.get(token)["cross_acquisition"]
    candidates = [Candidate(tuple(box), 0.7)]
    assert acquisition.update(target, candidates, float("inf"))["status"] == "searching"
    with monkeypatch.context() as patch:
        clock = iter([0, 0.3])
        patch.setattr(module.time, "monotonic", lambda: next(clock))
        patch.setattr(module, "choose_match", lambda *args, **kwargs: {"status": "searching"})
        assert engine.find(token, np.zeros_like(target), True)["status"] == "searching"
    assert acquisition.update(target, candidates, float("inf"))["status"] == "searching"
    assert acquisition.update(target, candidates, float("inf"))["status"] == "matched"


def test_two_matching_cases_remain_ambiguous():
    from collections import deque

    import torch

    engine, token, _, target, first = setup_case()
    target[100:292, 140:236] = target[100:292, 260:356]
    second = [140 / 480, 100 / 360, 236 / 480, 292 / 360]
    engine.segmentation.predictions = deque([(first, 0.99, 0.95), (second, 0.99, 0.95)] * 3)
    proposals = [
        SimpleNamespace(
            xyxy=torch.tensor([[260.0, 100.0, 356.0, 292.0]]), conf=torch.tensor([0.7])
        ),
        SimpleNamespace(
            xyxy=torch.tensor([[140.0, 100.0, 236.0, 292.0]]), conf=torch.tensor([0.7])
        ),
    ]
    engine.visual.predict = lambda *args, **kwargs: [SimpleNamespace(boxes=proposals)]
    for _ in range(2):
        assert engine.match(token, target)["status"] == "ambiguous"
    assert engine.sessions.get(token)["target"] is None


def test_quality_acquisition_requires_both_learned_checks():
    for weakened in ("memory", "appearance"):
        engine, token, _, target, _ = setup_case()
        if weakened == "memory":
            engine.segmentation.similarity = lambda *args: 0.5
        else:
            engine.appearance.score = lambda *args: 0.5
        for _ in range(2):
            assert engine.match(token, target)["status"] != "matched"
        assert engine.sessions.get(token)["target"] is None


def test_target_generation_change_requires_two_new_quality_observations():
    engine, token, _, target, _ = setup_case()
    scene = engine.sessions.get(token)["scene"]
    assert engine.match(token, target, stream=0)["status"] == "searching"
    assert engine.match(token, target, stream=1)["status"] == "searching"
    assert engine.match(token, target, stream=1)["status"] == "matched"
    assert engine.sessions.get(token)["scene"] is scene and scene.active


def test_absence_and_elapsed_time_invalidate_quality_confirmation():
    from matching import Candidate

    for reset in ("absence", "expiry"):
        engine, token, _, target, box = setup_case()
        acquisition = engine.sessions.get(token)["cross_acquisition"]
        clock = [0.0]
        acquisition.clock = lambda: clock[0]
        candidates = [Candidate(tuple(box), 0.7)]
        assert acquisition.update(target, candidates, float("inf"))["status"] == "searching"
        if reset == "absence":
            assert (
                acquisition.update(np.zeros_like(target), [], float("inf"))["status"] == "searching"
            )
        else:
            clock[0] = 2
        assert acquisition.update(target, candidates, float("inf"))["status"] == "searching"
        assert acquisition.update(target, candidates, float("inf"))["status"] == "matched"


def test_proposal_backend_error_clears_pending_quality_evidence(monkeypatch):
    import pytest

    import engine as module
    from matching import Candidate

    engine, token, _, target, box = setup_case()
    acquisition = engine.sessions.get(token)["cross_acquisition"]
    candidates = [Candidate(tuple(box), 0.7)]
    assert acquisition.update(target, candidates, float("inf"))["status"] == "searching"
    with monkeypatch.context() as patch:
        patch.setattr(module, "choose_match", lambda *args, **kwargs: {"status": "searching"})
        patch.setattr(module, "choose_appearance", lambda *args, **kwargs: {"status": "searching"})

        def failed(*args, **kwargs):
            raise RuntimeError("Proposal inference failed")

        patch.setattr(engine.visual, "predict", failed)
        with pytest.raises(RuntimeError, match="Proposal inference failed"):
            engine.find(token, target, True)
    assert acquisition.update(target, candidates, float("inf"))["status"] == "searching"
    assert acquisition.update(target, candidates, float("inf"))["status"] == "matched"


def test_absent_first_proposal_does_not_block_a_verified_later_proposal():
    from collections import deque

    from matching import Candidate

    engine, token, _, target, box = setup_case()
    target[100:292, 140:236] = target[100:292, 260:356]
    first = [140 / 480, 100 / 360, 236 / 480, 292 / 360]
    engine.segmentation.predictions = deque([(None, 0.01, 0.2), (box, 0.99, 0.95)] * 2)
    acquisition = engine.sessions.get(token)["cross_acquisition"]
    candidates = [Candidate(tuple(first), 0.7), Candidate(tuple(box), 0.7)]
    assert acquisition.update(target, candidates, float("inf"))["status"] == "searching"
    result = acquisition.update(target, candidates, float("inf"))
    assert result["status"] == "matched"
    assert np.allclose(result["box"], box)


def test_detector_omission_cannot_resolve_real_dense_duplicate_ambiguity():
    from collections import deque

    import torch

    from appearance import choose_appearance

    engine, _, source, large_target, _ = setup_case()
    patch = cv2.resize(large_target[100:292, 260:356], (32, 64))
    source[60:124, 80:112] = cv2.GaussianBlur(patch, (0, 0), 2.5)
    target = np.full_like(large_target, 35)
    target[100:164, 260:292] = patch
    target[100:164, 140:172] = patch
    source_box = [80 / 240, 60 / 180, 112 / 240, 124 / 180]
    box = [260 / 480, 100 / 360, 292 / 480, 164 / 360]
    engine.segmentation.predictions = deque([(source_box, 0.99, 0.95)] + [(box, 0.99, 0.95)] * 4)
    proposal = SimpleNamespace(
        xyxy=torch.tensor([[260.0, 100.0, 292.0, 164.0]]), conf=torch.tensor([0.7])
    )
    engine.visual.predict = lambda *args, **kwargs: [SimpleNamespace(boxes=[proposal])]
    token = engine.select(source, None, source_box)["token"]
    reference = engine.sessions.get(token)["reference"]
    assert choose_appearance(reference, target)["status"] == "ambiguous"
    for _ in range(2):
        assert engine.match(token, target)["status"] == "ambiguous"
    assert engine.sessions.get(token)["target"] is None


def test_context_success_discards_unused_cross_camera_confirmation(monkeypatch):
    from context_acquisition import AcquiredRegion

    engine, token, _, target, box = setup_case()
    assert engine.match(token, target)["status"] == "searching"
    selected = engine.sessions.get(token)
    cross = selected["cross_acquisition"]
    assert cross.pending is not None
    prediction = engine.segmentation.predict(target, box, 0, {})
    proof = AcquiredRegion(selected["reference"], target, box, prediction)
    monkeypatch.setattr(
        selected["context_acquisition"],
        "update",
        lambda image: {
            "status": "matched",
            "box": box,
            "acquisition": proof,
        },
    )
    assert engine.match(token, target)["status"] == "matched"
    assert cross.pending is None


def test_context_inference_error_clears_both_acquisition_confirmations(monkeypatch):
    import pytest

    from matching import Candidate

    engine, token, _, target, box = setup_case()
    selected = engine.sessions.get(token)
    selected["stream"] = 0
    cross = selected["cross_acquisition"]
    context = selected["context_acquisition"]
    candidates = [Candidate(tuple(box), 0.7)]
    assert cross.update(target, candidates, float("inf"))["status"] == "searching"
    context.pending = (box, {}, cross.clock())

    def failed(image):
        raise RuntimeError("Context inference failed")

    monkeypatch.setattr(context, "update", failed)
    with pytest.raises(RuntimeError, match="Context inference failed"):
        engine.match(token, target)
    assert cross.pending is None and context.pending is None
    assert cross.update(target, candidates, float("inf"))["status"] == "searching"


def test_cross_success_discards_unused_context_confirmation(monkeypatch):
    engine, token, _, target, box = setup_case()
    selected = engine.sessions.get(token)
    context = selected["context_acquisition"]

    def unconfirmed(image):
        context.pending = (box, {}, context.clock())
        return {"status": "searching"}

    monkeypatch.setattr(context, "update", unconfirmed)
    assert engine.match(token, target)["status"] == "searching"
    assert context.pending is not None
    assert engine.match(token, target)["status"] == "matched"
    assert context.pending is None
    assert selected["cross_acquisition"].pending is None
