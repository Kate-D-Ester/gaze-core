"""Loopback live transport; preprocessing and the shared inference queue stay bounded."""

import asyncio
import base64
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from time import monotonic, perf_counter
from typing import Literal
from urllib.parse import urlsplit

import numpy as np
from fastapi import WebSocket
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from starlette.websockets import WebSocketDisconnect

from .faces import FaceTrack, prepare_frames
from .jobs import ServiceError, Store
from .live_faces import LiveFaces, decode_frame
from .live_protocol import LiveBuffer, LiveOverlap, decode_packet, encode_packet
from .media import DecodedMedia

__all__ = ["LiveBuffer", "LiveOverlap", "decode_packet", "encode_packet", "serve_live"]


class LiveConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    type: Literal["configure"]
    sample_rate: Literal[16000]
    audio: Literal[True]
    source: Literal["camera", "network", "replay"]
    sync_verified: Literal[True]
    video_offset_ms: float = Field(ge=-500, le=500)
    client_time: float = Field(ge=0)

    @field_validator("source")
    @classmethod
    def capture_timing_required(cls, source):
        if source == "network":
            raise ValueError(
                "Network camera capture timestamps are unavailable; use a USB camera "
                "or a synchronized clip"
            )
        return source


class TargetConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["target"]
    generation: int = Field(ge=1, le=2**32 - 1)
    target_id: str | None = Field(max_length=64)


class RegionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    type: Literal["region"]
    box: tuple[float, float, float, float] | None


class LiveSession:
    def __init__(self, owner: Store, config: LiveConfig):
        self.owner, self.config = owner, config
        self.buffer = LiveBuffer()
        self.faces = LiveFaces()
        self.generation = 0
        self.target: str | None = None
        self.cancel = threading.Event()
        self.pending = 0
        self.loop = asyncio.get_running_loop()
        self.replies: asyncio.Queue[dict] = asyncio.Queue(maxsize=4)
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="live-face")
        self.overlap = LiveOverlap()
        self.overlap_generation = -1
        self.clock_offset = monotonic() - config.client_time
        self.last_feed = -1.0
        self.created = monotonic()

    def put_reply(self, reply):
        if self.cancel.is_set() or reply.get("generation") != self.generation:
            return
        try:
            self.replies.put_nowait(reply)
        except asyncio.QueueFull:
            self.cancel.set()

    def post(self, reply):
        if not self.loop.is_closed():
            self.loop.call_soon_threadsafe(self.put_reply, reply)

    def pause(self, message):
        self.target = None
        self.generation += 1
        self.buffer.reset()
        self.put_reply(
            {
                "type": "error",
                "code": "synchronization_or_target_lost",
                "message": message,
                "generation": self.generation,
            }
        )

    def select(self, target: TargetConfig):
        if target.generation <= self.generation:
            return
        if target.target_id and target.target_id not in self.faces.tracks:
            raise ValueError("Selected face expired; reacquire it")
        self.generation, self.target = target.generation, target.target_id
        self.buffer.reset()
        self.put_reply(
            {"type": "selected", "generation": self.generation, "target_id": self.target}
        )

    async def packet(self, data: bytes):
        packet = decode_packet(data)
        if packet.generation != self.generation:
            return
        if abs(monotonic() - self.clock_offset - packet.timestamp) > 1:
            raise ValueError("Live clock is stale or discontinuous; restart capture")
        if packet.kind == 2:
            timestamp = packet.timestamp + self.config.video_offset_ms / 1000

            def observe():
                image = decode_frame(packet.payload)
                self.faces.detect(image, timestamp)
                return image, self.faces.view()

            image, tracks = await self.loop.run_in_executor(self.executor, observe)
            for track in tracks:
                track["observations"][0]["timestamp"] -= self.config.video_offset_ms / 1000
            self.buffer.frame(timestamp, image)
            if packet.timestamp - self.last_feed >= 0.18:
                self.put_reply({"type": "faces", "generation": self.generation, "tracks": tracks})
                self.last_feed = packet.timestamp
            if self.target and self.target not in self.faces.tracks:
                self.pause("Selected face was lost; select it again")
                return
        elif self.target:
            self.buffer.audio(packet.timestamp, np.frombuffer(packet.payload, dtype="<f4").copy())
        if self.target:
            window = self.buffer.window()
            if window is not None:
                if self.pending >= 3:  # one running and at most two waiting windows
                    raise ValueError("Live overload: two waiting windows; stop and retry")
                track = self.faces.tracks.get(self.target)
                if not track:
                    self.pause("Selected face was lost; select it again")
                    return
                copied = FaceTrack(track.id, list(track.observations), track.manual)
                generation = self.generation
                self.pending += 1
                try:
                    self.owner.submit(lambda: self.infer(window, copied, generation))
                except ServiceError:
                    self.pending -= 1
                    raise

    def infer(self, window, track, generation):
        try:
            if self.cancel.is_set() or generation != self.generation:
                return
            start = perf_counter()
            media = DecodedMedia(
                Path("."),
                window.audio,
                window.frames,
                window.timestamps,
                window.frames[0].shape[1],
                window.frames[0].shape[0],
                2,
            )
            separator = self.owner.separator
            if separator is None:
                raise ValueError("The separation model is unavailable")
            frames = prepare_frames(
                media, track, window.start, 2, getattr(separator, "engine_key", "rtfs")
            )
            focused = separator.extract(window.audio, frames)
            if self.cancel.is_set() or generation != self.generation:
                return
            if self.overlap_generation != generation:
                self.overlap.reset()
                self.overlap_generation = generation
            output = self.overlap.emit(focused)
            self.post(
                {
                    "type": "audio",
                    "generation": generation,
                    "start": window.start,
                    "end": window.start + 1,
                    "sample_rate": 16000,
                    "device": separator.device,
                    "processing_seconds": perf_counter() - start,
                    "queued_windows": self.owner.queue.qsize(),
                    "delay_seconds": monotonic() - self.clock_offset - window.start,
                    "pcm": base64.b64encode(output.astype("<f4").tobytes()).decode("ascii"),
                }
            )
        except Exception as exc:
            self.post(
                {
                    "type": "error",
                    "code": "live_inference_failed",
                    "message": str(exc),
                    "generation": generation,
                }
            )
        finally:
            self.loop.call_soon_threadsafe(self.finished)

    def finished(self):
        self.pending -= 1

    async def close(self):
        self.cancel.set()
        self.generation += 1
        self.buffer.reset()
        await self.loop.run_in_executor(self.executor, self.faces.close)
        await asyncio.to_thread(self.executor.shutdown, wait=True, cancel_futures=True)


async def serve_live(socket: WebSocket):
    owner: Store = socket.app.state.store
    host = urlsplit("http://" + socket.headers.get("host", "")).hostname
    if socket.headers.get("origin") != owner.settings.origin or host not in {
        "localhost",
        "127.0.0.1",
        "::1",
    }:
        await socket.close(code=1008)
        return
    await socket.accept()
    session = None
    acquired = owner.live_lock.acquire(blocking=False)
    sender = None
    try:
        if not acquired:
            raise ServiceError("live_busy", "Only one live session can run at a time", 409)
        if owner.separator is None or owner.model_state != "ready":
            raise ServiceError("model_unready", "Wait for the local model to be ready", 503)
        config = LiveConfig.model_validate_json(await asyncio.wait_for(socket.receive_text(), 5))
        session = LiveSession(owner, config)
        await session.loop.run_in_executor(session.executor, session.faces.initialize)
        await socket.send_json(
            {
                "type": "ready",
                "generation": 0,
                "device": owner.separator.device,
                "window_seconds": 2,
                "stride_seconds": 1,
                "playout_seconds": 4,
            }
        )

        async def send_replies():
            while not session.cancel.is_set():
                reply = await session.replies.get()
                if reply["generation"] != session.generation:
                    continue
                await socket.send_json(reply)

        sender = asyncio.create_task(send_replies())
        count, last_count = 0, monotonic()
        while not session.cancel.is_set():
            if monotonic() - session.created > owner.settings.max_duration:
                raise ValueError("Live session reached its duration limit; stop and restart")
            message = await asyncio.wait_for(socket.receive(), 5)
            if message["type"] == "websocket.disconnect":
                break
            count += 1
            if monotonic() - last_count >= 1:
                count, last_count = 0, monotonic()
            if count > 80:
                raise ValueError("Live message rate limit exceeded")
            if message.get("bytes") is not None:
                await session.packet(message["bytes"])
            else:
                text = message.get("text", "")
                if len(text) > 2048:
                    raise ValueError("Live control message is too large")
                control = json.loads(text)
                if control.get("type") == "stop":
                    break
                if control.get("type") == "target":
                    session.select(TargetConfig.model_validate(control))
                elif control.get("type") == "region":
                    correction = RegionConfig.model_validate(control)
                    session.pause("Region changed; select the corrected face")
                    await session.loop.run_in_executor(
                        session.executor, session.faces.correct, correction.box
                    )
                else:
                    raise ValueError("Unknown live control message")
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except (ValueError, ValidationError, ServiceError, TimeoutError, RuntimeError) as exc:
        try:
            await socket.send_json(
                {
                    "type": "error",
                    "code": getattr(exc, "code", "invalid_live_input"),
                    "message": str(exc),
                    "generation": session.generation if session else 0,
                }
            )
            await socket.close(code=1008)
        except (WebSocketDisconnect, RuntimeError):
            pass
    finally:
        if sender:
            sender.cancel()
            await asyncio.gather(sender, return_exceptions=True)
        if session:
            await session.close()
        if acquired:
            owner.live_lock.release()
        try:
            await socket.close()
        except (WebSocketDisconnect, RuntimeError):
            pass
