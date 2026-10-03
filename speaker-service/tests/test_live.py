import asyncio
from time import monotonic
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from gaze_speaker.api import create_app
from gaze_speaker.jobs import ServiceError, Store
from gaze_speaker.live import LiveConfig, LiveSession, TargetConfig
from gaze_speaker.live_faces import decode_frame
from gaze_speaker.settings import Settings
from gaze_speaker.stream_protocol import encode_packet


def config(**changes):
    data = dict(
        type="configure",
        protocol_version=2,
        sample_rate=16000,
        audio=True,
        source="replay",
        sync_verified=True,
        video_offset_ms=0,
        client_time=monotonic(),
    )
    data.update(changes)
    return data


@pytest.mark.parametrize(
    "changes",
    [
        {"protocol_version": 1},
        {"audio": False},
        {"sync_verified": False},
        {"sample_rate": 48000},
        {"source": "network"},
        {"video_offset_ms": float("inf")},
    ],
)
def test_configuration_rejects_obsolete_or_unsafe_inputs(changes):
    with pytest.raises(ValidationError):
        LiveConfig.model_validate(config(**changes))


def test_stream_owner_reserves_worker_from_batch_jobs(tmp_path):
    store = Store(Settings(data_dir=tmp_path), start_worker=False, load_model=False)
    store.live_lock.acquire()
    try:
        with pytest.raises(ServiceError, match="live"):
            store.submit(lambda: None)
        store.submit(lambda: None, live=True)
        assert store.queue.qsize() == 1
    finally:
        store.live_lock.release()
        store.close()


def test_origin_ready_heartbeat_and_reconnect_beyond_clip_limit(tmp_path, monkeypatch):
    monkeypatch.setattr("gaze_speaker.live_faces.LiveFaces.initialize", lambda _: None)
    settings = Settings(data_dir=tmp_path, max_duration=0.001)
    store = Store(settings, start_worker=False, load_model=False)
    store.separator = SimpleNamespace(device="cpu", engine_key="rtfs")
    store.model_state = "ready"
    store.streaming_ready = True
    store.warm_timings = [0.1, 0.2, 0.15]
    with TestClient(create_app(settings, store), base_url="http://127.0.0.1") as client:
        for _ in range(2):
            with client.websocket_connect(
                "ws://127.0.0.1/live", headers={"origin": settings.origin}
            ) as socket:
                socket.send_json(config())
                ready = socket.receive_json()
                assert ready.get("protocol_version") == 2, ready
                assert "playout_seconds" not in ready
                socket.send_json({"type": "pause"})
                socket.send_json({"type": "heartbeat"})
                socket.send_json({"type": "target", "generation": 1, "target_id": None})
                assert socket.receive_json()["type"] == "selected"
                socket.send_json({"type": "stop"})
                from starlette.websockets import WebSocketDisconnect

                with pytest.raises(WebSocketDisconnect):
                    socket.receive_json()
        assert not store.live_lock.locked()


@pytest.mark.asyncio
async def test_stale_capture_is_rejected_but_paused_source_time_is_valid(tmp_path):
    store = Store(Settings(data_dir=tmp_path), start_worker=False, load_model=False)
    session = LiveSession(store, LiveConfig.model_validate(config()))
    session.generation = 1
    session.target = "face"
    try:
        pcm = np.zeros(1600, dtype="<f4").tobytes()
        await session.packet(encode_packet(1, 1, 0, monotonic(), pcm))
        # A later capture clock is valid even though the source position only advances 100 ms.
        await session.packet(encode_packet(1, 1, 1600, monotonic() + 0.4, pcm))
        with pytest.raises(ValueError, match="clock"):
            await session.packet(encode_packet(1, 1, 3200, monotonic() - 2, pcm))
    finally:
        await session.close()
        store.close()


@pytest.mark.asyncio
async def test_generation_change_discards_late_worker_result(tmp_path):
    from gaze_speaker.faces import FaceTrack

    store = Store(Settings(data_dir=tmp_path), start_worker=False, load_model=False)
    session = LiveSession(store, LiveConfig.model_validate(config()))
    try:
        session.faces.tracks["face"] = FaceTrack("face")
        session.select(TargetConfig(type="target", generation=1, target_id="face"))
        session.pending = 1
        session.select(TargetConfig(type="target", generation=2, target_id=None))
        session.infer(None, None, 1)
        await asyncio.sleep(0)
        assert all(
            session.replies.get_nowait()["type"] == "selected"
            for _ in range(session.replies.qsize())
        )
        assert session.pending == 0
    finally:
        await session.close()
        store.close()


def test_jpeg_bomb_rejected_before_decode():
    from io import BytesIO

    from PIL import Image

    data = BytesIO()
    Image.new("RGB", (641, 16)).save(data, format="JPEG")
    with pytest.raises(ValueError, match="dimensions"):
        decode_frame(data.getvalue())


@pytest.mark.asyncio
async def test_final_drain_delivers_every_accepted_sample_with_bounded_queue(tmp_path, monkeypatch):
    from test_noise import IdentityNative

    from gaze_speaker.faces import FaceTrack
    from gaze_speaker.noise import NoiseSuppressor
    from gaze_speaker.stream_processor import StreamProcessor

    monkeypatch.setattr(
        "gaze_speaker.stream_processor.prepare_frames",
        lambda *_: np.zeros((50, 88, 88), np.float32),
    )
    owner = Store(Settings(data_dir=tmp_path), start_worker=False, load_model=False)
    owner.separator = SimpleNamespace(
        device="cpu", engine_key="rtfs", extract=lambda audio, _: audio
    )
    session = LiveSession(owner, LiveConfig.model_validate(config()))
    session.faces.tracks["face"] = FaceTrack("face")
    session.select(TargetConfig(type="target", generation=1, target_id="face"))
    session.processor = StreamProcessor(
        owner.separator,
        session.profile,
        noise_factory=lambda: NoiseSuppressor(native_factory=IdentityNative),
    )
    session.processor.reset(1)
    size = 39017
    for start in range(0, size, 1600):
        session.buffer.frame(start, np.zeros((8, 8, 3), np.uint8))
        count = min(1600, size - start)
        session.buffer.audio(start, monotonic(), np.full(count, 0.2, np.float32))
    session.accepted_end = size
    session.end(size)
    assert session.pending <= 2
    delivered = []
    try:
        for _ in range(12):
            while not owner.queue.empty():
                owner.queue.get_nowait()()
                owner.queue.task_done()
                await asyncio.sleep(0)
                assert session.pending <= 2
            await asyncio.sleep(0)
            while not session.replies.empty():
                delivered.append(session.replies.get_nowait())
            if any(r["type"] == "drained" for r in delivered):
                break
        assert sum(r["sample_count"] for r in delivered if r["type"] == "audio") == size
        assert delivered[-1]["type"] == "drained"
    finally:
        await session.close()
        owner.close()


def test_stream_warmup_excludes_cold_call_and_preserves_file_capability_on_failure(tmp_path):
    store = Store(Settings(data_dir=tmp_path), start_worker=False, load_model=False)
    calls = []
    store.separator = SimpleNamespace(extract=lambda audio, frames: calls.append((audio, frames)))
    store._warm_streaming()
    assert len(calls) == 4
    assert np.any(calls[0][0] != 0)
    assert len(store.warm_timings) == 3
    assert store.streaming_ready
    store.streaming_ready = False

    def failed(*_):
        raise RuntimeError("device unavailable")

    store.separator.extract = failed
    store._warm_streaming()
    assert not store.streaming_ready
    assert store.separator is not None
    assert "device unavailable" in store.streaming_error
    store.close()
