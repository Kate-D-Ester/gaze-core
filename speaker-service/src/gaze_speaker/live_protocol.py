"""Bounded timestamped packets and causal two-second overlap-add."""

import struct
from collections import deque
from dataclasses import dataclass

import numpy as np

from .model import SAMPLE_RATE

HEADER = struct.Struct("<4sB3xIdI")


@dataclass(frozen=True)
class Packet:
    kind: int
    generation: int
    timestamp: float
    payload: bytes


def encode_packet(kind: int, generation: int, timestamp: float, payload: bytes) -> bytes:
    return HEADER.pack(b"GSP1", kind, generation, timestamp, len(payload)) + payload


def decode_packet(data: bytes) -> Packet:
    if len(data) < HEADER.size or len(data) > 220_000:
        raise ValueError("Malformed live packet size")
    magic, kind, generation, timestamp, size = HEADER.unpack_from(data)
    if magic != b"GSP1" or kind not in {1, 2} or size != len(data) - HEADER.size:
        raise ValueError("Malformed live packet header")
    if not np.isfinite(timestamp) or timestamp < 0:
        raise ValueError("Invalid live timestamp")
    payload = data[HEADER.size :]
    if kind == 1:
        if not size or size % 4 or size > 3200 * 4:
            raise ValueError("Live PCM must contain at most 200 ms of float32 audio")
        pcm = np.frombuffer(payload, dtype="<f4")
        if not np.isfinite(pcm).all() or np.max(np.abs(pcm)) > 1.01:
            raise ValueError("Live PCM must be finite normalized mono audio")
    elif not payload:
        raise ValueError("Empty live video frame")
    return Packet(kind, generation, timestamp, payload)


@dataclass
class LiveWindow:
    start: float
    audio: np.ndarray
    frames: list[np.ndarray]
    timestamps: np.ndarray


class LiveBuffer:
    def __init__(self):
        self.frames: deque[tuple[float, np.ndarray]] = deque(maxlen=64)
        self.pcm = np.empty(0, dtype=np.float32)
        self.start: float | None = None
        self.next_audio: float | None = None

    @property
    def sample_count(self):
        return self.pcm.size

    def reset(self):
        self.frames.clear()
        self.pcm = np.empty(0, dtype=np.float32)
        self.start = self.next_audio = None

    def audio(self, timestamp: float, pcm: np.ndarray):
        if self.next_audio is not None and abs(timestamp - self.next_audio) > 0.003:
            raise ValueError("Audio clock drift/discontinuity; stop and recheck synchronization")
        if self.pcm.size + pcm.size > SAMPLE_RATE * 3:
            raise ValueError("Live audio overload; the camera or processing is behind")
        if self.start is None:
            self.start = timestamp
        self.next_audio = timestamp + pcm.size / SAMPLE_RATE
        self.pcm = np.concatenate((self.pcm, pcm))

    def frame(self, timestamp: float, image: np.ndarray):
        if self.frames and timestamp <= self.frames[-1][0]:
            raise ValueError("Video clock discontinuity; reconnect the source")
        self.frames.append((timestamp, image))
        while self.frames and timestamp - self.frames[0][0] > 3.5:
            self.frames.popleft()

    def window(self) -> LiveWindow | None:
        if self.pcm.size < SAMPLE_RATE * 2 or self.start is None:
            return None
        start, end = self.start, self.start + 2
        if not self.frames:
            raise ValueError("Missing video; check camera/microphone synchronization")
        times = np.array([item[0] for item in self.frames])
        if times[-1] < end - 0.15:
            if self.next_audio and self.next_audio - times[-1] > 0.3:
                raise ValueError("Audio/video skew exceeds 150 ms; recheck synchronization")
            return None
        indices = np.flatnonzero((times >= start - 0.15) & (times <= end + 0.15))
        chosen = times[indices]
        if (
            not chosen.size
            or abs(chosen[0] - start) > 0.15
            or abs(chosen[-1] - end) > 0.15
            or np.any(np.diff(chosen) > 0.15 + 1e-6)
        ):
            raise ValueError("Video gap/skew exceeds 150 ms; reacquire synchronized input")
        result = LiveWindow(
            start,
            self.pcm[: SAMPLE_RATE * 2].copy(),
            [self.frames[int(i)][1] for i in indices],
            chosen,
        )
        self.pcm = self.pcm[SAMPLE_RATE:].copy()
        self.start += 1
        return result


class LiveOverlap:
    def __init__(self):
        self.previous: np.ndarray | None = None
        self.weights = np.hanning(SAMPLE_RATE * 2 + 2)[1:-1].astype(np.float32)

    def reset(self):
        self.previous = None

    def emit(self, audio: np.ndarray) -> np.ndarray:
        if audio.shape != (SAMPLE_RATE * 2,) or not np.isfinite(audio).all():
            raise ValueError("Invalid live model output")
        head, tail = audio[:SAMPLE_RATE], audio[SAMPLE_RATE:]
        if self.previous is None:
            output = head.copy()
            output[:240] *= np.linspace(0, 1, 240)
        else:
            a, b = self.weights[SAMPLE_RATE:], self.weights[:SAMPLE_RATE]
            output = (self.previous * a + head * b) / (a + b)
        self.previous = tail.copy()
        peak = float(np.max(np.abs(output)))
        return (output * min(1, 0.98 / peak) if peak else output).astype(np.float32)
