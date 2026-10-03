import struct
from time import monotonic
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from gaze_speaker.api import create_app
from gaze_speaker.jobs import Store
from gaze_speaker.live import LiveBuffer, LiveConfig, LiveOverlap, decode_packet, encode_packet
from gaze_speaker.live_faces import decode_frame
from gaze_speaker.settings import Settings


def test_binary_protocol_rejects_malformed_and_nonfinite_packets():
    audio = np.zeros(1600, dtype="<f4").tobytes()
    packet = decode_packet(encode_packet(1, 3, 10.0, audio))
    assert (packet.kind, packet.generation, packet.timestamp) == (1, 3, 10.0)
    for bad in [
        b"bad",
        encode_packet(1, 3, float("nan"), audio),
        encode_packet(1, 3, 10, struct.pack("<f", float("inf"))),
        encode_packet(9, 3, 10, audio),
        encode_packet(1, 3, 10, audio)[:-1],
    ]:
        with pytest.raises(ValueError):
            decode_packet(bad)


def test_audio_clock_detects_discontinuity_and_drift():
    buffer = LiveBuffer()
    buffer.audio(10, np.zeros(1600, dtype=np.float32))
    with pytest.raises(ValueError, match="clock"):
        buffer.audio(10.2, np.zeros(1600, dtype=np.float32))
    buffer.reset()
    buffer.audio(10, np.zeros(1600, dtype=np.float32))
    with pytest.raises(ValueError, match="clock"):
        buffer.audio(9, np.zeros(1600, dtype=np.float32))


def test_window_alignment_requires_video_and_bounds_memory():
    buffer = LiveBuffer()
    for i in range(20):
        buffer.audio(10 + i * 0.1, np.zeros(1600, dtype=np.float32))
    with pytest.raises(ValueError, match="video"):
        buffer.window()
    buffer.frame(10, np.zeros((8, 8, 3), dtype=np.uint8))
    buffer.frame(11.9, np.zeros((8, 8, 3), dtype=np.uint8))
    with pytest.raises(ValueError, match="gap"):
        buffer.window()
    buffer.reset()
    for i in range(40):
        buffer.frame(10 + i * 0.1, np.zeros((8, 8, 3), dtype=np.uint8))
        buffer.audio(10 + i * 0.1, np.zeros(1600, dtype=np.float32))
        if i >= 19:
            buffer.window()
    assert buffer.sample_count <= 32000
    assert len(buffer.frames) <= 42


def test_overlap_is_continuous_and_reset_discards_old_target():
    overlap = LiveOverlap()
    assert np.allclose(overlap.emit(np.ones(32000, dtype=np.float32) * 0.2)[240:], 0.2)
    output = overlap.emit(np.ones(32000, dtype=np.float32) * 0.2)
    assert output.shape == (16000,)
    assert np.allclose(output, 0.2)
    overlap.reset()
    assert np.max(overlap.emit(np.zeros(32000, dtype=np.float32))) == 0


def config(**changes):
    return dict(
        type="configure",
        sample_rate=16000,
        audio=True,
        source="replay",
        sync_verified=True,
        video_offset_ms=0,
        client_time=monotonic(),
        **changes,
    )


def test_live_configuration_rejects_missing_microphone_unverified_timing_and_rate_change():
    for field, value in [
        ("audio", False),
        ("sync_verified", False),
        ("sample_rate", 48000),
        ("video_offset_ms", float("inf")),
    ]:
        data = config()
        data[field] = value
        with pytest.raises(ValueError):
            LiveConfig.model_validate(data)


def test_live_websocket_origin_guard_reconnect_and_explicit_stop(tmp_path, monkeypatch):
    monkeypatch.setattr("gaze_speaker.live_faces.LiveFaces.initialize", lambda self: None)
    settings = Settings(data_dir=tmp_path / "sessions")
    store = Store(settings, start_worker=False, load_model=False)
    store.separator = SimpleNamespace(device="cpu")
    store.model_state = "ready"
    with TestClient(create_app(settings, store), base_url="http://127.0.0.1") as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(
                "ws://127.0.0.1/live", headers={"origin": "https://attacker.example"}
            ):
                pass
        for _ in range(2):
            with client.websocket_connect(
                "ws://127.0.0.1/live", headers={"origin": settings.origin}
            ) as socket:
                socket.send_json(config())
                assert socket.receive_json()["type"] == "ready"
                socket.send_json({"type": "stop"})
                with pytest.raises(WebSocketDisconnect):
                    socket.receive_json()
        assert not store.live_lock.locked()


def test_live_jpeg_bomb_dimensions_are_rejected_before_decode():
    from io import BytesIO

    from PIL import Image

    image = Image.new("RGB", (641, 16))
    data = BytesIO()
    image.save(data, format="JPEG")
    with pytest.raises(ValueError, match="dimensions"):
        decode_frame(data.getvalue())


@pytest.mark.asyncio
async def test_generation_change_cancels_queued_inference_and_live_queue_is_bounded(
    tmp_path, monkeypatch
):
    from gaze_speaker.faces import FaceTrack
    from gaze_speaker.live import LiveSession, TargetConfig

    owner = Store(Settings(data_dir=tmp_path / "sessions"), start_worker=False, load_model=False)
    session = LiveSession(owner, LiveConfig.model_validate(config()))
    try:
        session.faces.tracks["face"] = FaceTrack("face")
        session.select(TargetConfig(type="target", generation=1, target_id="face"))
        session.pending = 1
        session.select(TargetConfig(type="target", generation=2, target_id=None))
        session.infer(None, None, 1)
        await __import__("asyncio").sleep(0)
        assert session.replies.qsize() == 2  # only target acknowledgements, no stale audio
        now = monotonic()
        session.target = "face"
        session.pending = 3
        for i in range(20):
            session.buffer.frame(now - 2 + i * 0.1, np.zeros((8, 8, 3), dtype=np.uint8))
            session.buffer.audio(now - 2 + i * 0.1, np.zeros(1600, dtype=np.float32))
        monkeypatch.setattr(
            "gaze_speaker.live.decode_frame", lambda _: np.zeros((8, 8, 3), dtype=np.uint8)
        )
        monkeypatch.setattr(session.faces, "detect", lambda *_: None)
        monkeypatch.setattr(session.faces, "view", lambda: [])
        with pytest.raises(ValueError, match="overload"):
            await session.packet(encode_packet(2, 2, now, b"jpeg"))
    finally:
        await session.close()
        owner.close()


@pytest.mark.asyncio
async def test_late_inference_error_is_discarded_after_target_change(tmp_path, monkeypatch):
    from gaze_speaker.live import LiveSession
    from gaze_speaker.live_protocol import LiveWindow

    owner = Store(Settings(data_dir=tmp_path / "sessions"), start_worker=False, load_model=False)
    session = LiveSession(owner, LiveConfig.model_validate(config()))
    session.generation = 1

    def failure(*_):
        session.generation = 2
        raise ValueError("Old target failed")

    owner.separator = SimpleNamespace(device="cpu", extract=failure)
    monkeypatch.setattr(
        "gaze_speaker.live.mouth_sequence", lambda *_: np.zeros((50, 88, 88), np.float32)
    )
    try:
        frame = np.zeros((8, 8, 3), np.uint8)
        session.pending = 1
        session.infer(LiveWindow(0, np.zeros(32000, np.float32), [frame], np.array([0.0])), None, 1)
        await __import__("asyncio").sleep(0)
        assert session.replies.empty()
    finally:
        await session.close()
        owner.close()


def test_live_ready_waits_for_preprocessor_initialization(tmp_path, monkeypatch):
    from gaze_speaker.live_faces import LiveFaces

    initialized = []
    monkeypatch.setattr(
        LiveFaces, "initialize", lambda self: initialized.append(True), raising=False
    )
    settings = Settings(data_dir=tmp_path / "sessions")
    store = Store(settings, start_worker=False, load_model=False)
    store.separator = SimpleNamespace(device="cpu")
    store.model_state = "ready"
    with TestClient(create_app(settings, store)) as client:
        with client.websocket_connect(
            "ws://127.0.0.1/live", headers={"origin": settings.origin}
        ) as socket:
            socket.send_json(config())
            assert socket.receive_json()["type"] == "ready"
            assert initialized == [True]
            socket.send_json({"type": "stop"})


def test_arrival_only_network_camera_is_rejected_despite_manual_sync_check():
    data = config()
    data["source"] = "network"
    with pytest.raises(ValueError, match="capture timestamps"):
        LiveConfig.model_validate(data)


def test_live_lost_face_is_removed_immediately_from_selectable_tracks():
    from gaze_speaker.faces import FaceObservation, FaceTrack
    from gaze_speaker.live_faces import LiveFaces

    faces = LiveFaces()
    faces.detector = SimpleNamespace(detect=lambda image: SimpleNamespace(face_landmarks=[]))
    faces.last_detection = 0
    box = (0.1, 0.1, 0.2, 0.3)
    identity = faces.associator.update([box], 0)[0]
    faces.tracks[identity] = FaceTrack(
        identity,
        [
            FaceObservation(
                0,
                box,
                np.zeros((5, 2)),
                np.zeros(2),
            )
        ],
    )
    faces.detect(np.zeros((64, 64, 3), dtype=np.uint8), 0.2)
    assert faces.view() == []
