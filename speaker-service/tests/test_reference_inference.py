import importlib
import os
from pathlib import Path

import numpy as np
import pytest


def test_si_sdr_is_scale_invariant_and_rejects_silent_target():
    try:
        score = importlib.import_module("gaze_speaker.benchmark").si_sdr
    except ModuleNotFoundError:
        pytest.fail("reproducible benchmark is not implemented")
    signal = np.sin(np.arange(1000) * 0.3)
    assert score(signal, signal * 0.5) > 80
    with pytest.raises(ValueError, match="silent"):
        score(np.zeros(1000), signal)


@pytest.mark.model
@pytest.mark.skipif(
    os.environ.get("GAZE_REFERENCE_TESTS") != "1", reason="explicit real reference benchmark"
)
def test_real_reference_outputs_are_distinct_finite_and_synchronized():
    import json

    import soundfile as sf

    report = json.loads(Path("data/benchmarks/debate/report.json").read_text())
    assert report["input"]["name"] == "cnn-debate-low-quality-320x180-15fps.mp4"
    outputs = []
    for target in report["targets"]:
        pcm, rate = sf.read(target["audio"])
        assert rate == 16000 and pcm.size == report["sample_count"]
        assert np.isfinite(pcm).all() and np.max(np.abs(pcm)) <= 1
        assert Path(target["preview"]).is_file()
        outputs.append(pcm)
    assert len(outputs) == 3
    assert (
        max(abs(np.corrcoef(a, b)[0, 1]) for i, a in enumerate(outputs) for b in outputs[i + 1 :])
        < 0.98
    )
