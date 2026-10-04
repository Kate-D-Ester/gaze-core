import base64
import json
import threading
import urllib.error
import urllib.request

import cv2
import numpy as np
import pytest

from service import create_server, decode_image
from sessions import Sessions


def jpeg():
    ok, data = cv2.imencode(".jpg", np.zeros((80, 120, 3), np.uint8))
    assert ok
    return base64.b64encode(data).decode()


def test_image_validation_before_decoding():
    assert decode_image(jpeg()).shape == (80, 120, 3)
    for value in ["not-base64", "https://camera/stream", 2, ""]:
        with pytest.raises(ValueError):
            decode_image(value)
    _, png = cv2.imencode(".png", np.zeros((80, 120, 3), np.uint8))
    with pytest.raises(ValueError):
        decode_image(base64.b64encode(png).decode())
    _, huge = cv2.imencode(".jpg", np.zeros((80, 1281, 3), np.uint8))
    with pytest.raises(ValueError):
        decode_image(base64.b64encode(huge).decode())


def test_sessions_expire_and_retain_no_more_than_four():
    clock = [10]
    sessions = Sessions(lambda: clock[0])
    tokens = [sessions.add({"label": str(i)}) for i in range(5)]
    with pytest.raises(KeyError):
        sessions.get(tokens[0])
    assert sessions.get(tokens[-1])["label"] == "4"
    clock[0] = 611
    with pytest.raises(KeyError):
        sessions.get(tokens[-1])


class ImageBoundary:
    """Replace only expensive YOLO inference; HTTP and image validation stay real."""

    def status(self):
        return {"status": "ready"}

    def select(self, image, point, box):
        assert image.shape == (80, 120, 3)
        return {"token": "test-token", "box": [0, 0, 1, 1], "label": "Object"}

    def match(self, token, image):
        return {"status": "searching"}

    def clear(self, token):
        pass


def test_http_requires_secret_and_rejects_malformed_and_oversized_input():
    server = create_server(ImageBoundary(), "test-secret")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}"

    def send(body, secret="test-secret"):
        request = urllib.request.Request(
            url, body, {"Content-Type": "application/json", "Authorization": f"Bearer {secret}"}
        )
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    try:
        assert send(b'{"action":"status"}', "wrong")[0] == 401
        assert send(b"not-json")[0] == 400
        request = urllib.request.Request(
            url,
            b"x",
            {
                "Content-Type": "application/json",
                "Authorization": "Bearer test-secret",
                "Content-Length": str(2 * 1024 * 1024 + 1),
            },
        )
        with pytest.raises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(request, timeout=2)
        assert error.value.code == 413
        assert (
            send(
                json.dumps({"action": "select", "image": "invalid", "point": [0.5, 0.5]}).encode()
            )[0]
            == 400
        )
        status, result = send(
            json.dumps({"action": "select", "image": jpeg(), "point": [0.5, 0.5]}).encode()
        )
        assert status == 200
        assert result["label"] == "Object"
        assert send(b'{"action":"url","url":"https://camera/stream"}')[0] == 400
    finally:
        server.shutdown()
        server.server_close()


def test_idle_service_expires_references_without_another_request():
    class ExpiringBoundary(ImageBoundary):
        def __init__(self):
            self.clock = 0
            self.sessions = Sessions(lambda: self.clock)

        def expire(self):
            self.sessions.expire()

    boundary = ExpiringBoundary()
    token = boundary.sessions.add({"label": "temporary"})
    server = create_server(boundary, "test-secret")
    try:
        boundary.clock = 601
        server.service_actions()
        assert token not in boundary.sessions.items
    finally:
        server.server_close()


def test_clearing_last_reference_releases_predictor_camera_buffers():
    from types import SimpleNamespace

    from engine import VisionEngine

    engine = VisionEngine.__new__(VisionEngine)
    engine.sessions = Sessions()
    token = engine.sessions.add({"label": "temporary"})
    engine.active = token
    engine.visual = SimpleNamespace(
        predictor=SimpleNamespace(batch="camera pixels", results="camera results")
    )
    engine.detector = SimpleNamespace(predictor=SimpleNamespace(batch="scene pixels"))
    engine.clear(token)
    assert not engine.sessions.items
    assert engine.visual.predictor is None
    assert engine.detector.predictor is None
