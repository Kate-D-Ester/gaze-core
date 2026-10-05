import pytest

from evaluate_video import overlap, validate_cases


def test_case_paths_and_time_ranges_are_validated_before_writing_outputs():
    valid = {
        "name": "hand-open",
        "start": 1,
        "end": 3,
        "box": [0.1, 0.2, 0.4, 0.6],
        "truth": {"2": [0.1, 0.2, 0.4, 0.6]},
    }
    assert validate_cases([valid], 10)[0]["name"] == "hand-open"
    for updates in [
        {"name": "../private"},
        {"end": 11},
        {"start": 4},
        {"truth": {"8": [0.1, 0.2, 0.4, 0.6]}},
    ]:
        with pytest.raises(ValueError):
            validate_cases([{**valid, **updates}], 10)


def test_accuracy_uses_independent_ground_truth_overlap_and_counts_missing_boxes():
    assert overlap([0, 0, 0.5, 1], [0.25, 0, 0.75, 1]) == pytest.approx(1 / 3)
    assert overlap(None, [0, 0, 0.5, 1]) == 0


def test_annotated_frames_are_evaluated_even_between_sampling_ticks():
    from evaluate_video import analyzed_frame

    assert analyzed_frame(2, 0, 3, {2: [0, 0, 0.5, 1]})
    assert analyzed_frame(3, 0, 3, {})
    assert not analyzed_frame(2, 0, 3, {})


def test_multiple_truth_annotations_rounding_to_one_frame_are_all_retained():
    from evaluate_video import checkpoint_frames

    truth = {".05": [0, 0, 0.5, 1], ".06": [0, 0, 0.5, 1]}
    checkpoints = checkpoint_frames(truth, 30)
    assert sum(map(len, checkpoints.values())) == len(truth)
    assert len(checkpoints[2]) == 2


def test_case_evaluation_accounts_for_each_annotation_through_the_real_loop(monkeypatch, tmp_path):
    from types import SimpleNamespace

    import numpy as np

    import evaluate_video as module

    box = [0.2, 0.2, 0.5, 0.6]
    video = SimpleNamespace(
        set=lambda *args: None, read=lambda: (True, np.full((60, 80, 3), 100, np.uint8))
    )
    engine = SimpleNamespace(
        select=lambda *args: {"token": "test"},
        track=lambda *args: {"status": "matched", "box": box},
        match=lambda *args: {"status": "searching"},
        clear=lambda *args: None,
    )
    writer = SimpleNamespace(isOpened=lambda: True, write=lambda *args: None, release=lambda: None)
    monkeypatch.setattr(module.cv2, "VideoWriter", lambda *args: writer)
    monkeypatch.setattr(module.subprocess, "run", lambda *args, **kwargs: None)
    case = {"name": "sample", "start": 0, "end": 0.1, "box": box, "truth": {".05": box, ".06": box}}
    summary = module.run_case(engine, video, 30, case, tmp_path)
    assert summary["checkpointCount"] == 2
    assert [item["time"] for item in summary["checkpoints"]] == [0.05, 0.06]
    assert summary["sceneCheckpointSuccessFraction"] == 1
    assert summary["targetCheckpointSuccessFraction"] == 0
