"""One bounded stream owner; model and enhancement state stay on the shared worker."""

import asyncio
import base64
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from time import monotonic

import numpy as np

from .faces import FaceTrack
from .jobs import ServiceError
from .live_faces import LiveFaces, decode_frame
from .stream_processor import StreamProcessor
from .stream_profile import profile_for
from .stream_protocol import LiveBuffer, decode_packet


class LiveSession:
    def __init__(self, owner, config):
        self.owner = owner
        self.config = config
        self.profile = profile_for(owner.settings.engine)
        self.buffer = LiveBuffer(self.profile)
        self.faces = LiveFaces()
        self.generation = 0
        self.target = None
        self.cancel = threading.Event()
        self.pending = 0
        self.loop = asyncio.get_running_loop()
        self.replies = asyncio.Queue(maxsize=12)
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="live-face")
        self.processor = None
        self.clock_offset = monotonic() - config.client_time
        self.last_feed = -1
        self.flow_paused = False
        self.paused = False
        self.reserve_samples = 0
        self.end_sample = None
        self.accepted_end = None
        self.last_track = None
        self.finishing = False

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

    def flow(self, paused, reason="worker"):
        if paused == self.flow_paused:
            return
        self.flow_paused = paused
        self.reserve_samples = 0
        self.put_reply(
            {
                "type": "flow",
                "generation": self.generation,
                "action": "pause" if paused else "resume",
                "queued_windows": self.pending,
                "reason": reason,
            }
        )

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

    def select(self, target):
        if target.generation <= self.generation:
            return
        if target.target_id and target.target_id not in self.faces.tracks:
            raise ValueError("Selected face expired; reacquire it")
        if target.replay_start_sample is not None:
            if self.config.source != "replay" or target.target_id is not None:
                raise ValueError("Replay rewind requires a fresh face selection")
            self.faces.correct(self.faces.region)
            self.last_feed = -1
        self.generation = target.generation
        self.target = target.target_id
        self.buffer.reset()
        self.end_sample = None
        self.accepted_end = None
        self.last_track = None
        self.finishing = False
        self.paused = False
        self.flow_paused = False
        self.reserve_samples = 0
        self.put_reply(
            {"type": "selected", "generation": self.generation, "target_id": self.target}
        )
        if self.pending >= 2:
            self.flow(True)

    async def packet(self, data):
        packet = decode_packet(data)
        if packet.generation != self.generation:
            return
        if abs(monotonic() - self.clock_offset - packet.capture_time) > 1:
            raise ValueError("Capture clock is stale or discontinuous; restart capture")
        if self.end_sample is not None:
            return
        if packet.kind == 2:
            index = packet.sample_start + round(self.config.video_offset_ms * 16)
            timestamp = index / 16000

            def observe():
                image = decode_frame(packet.payload)
                self.faces.detect(image, timestamp)
                return image, self.faces.view()

            image, tracks = await self.loop.run_in_executor(self.executor, observe)
            # Camera observations use its capture clock; replay uses source seconds.
            if not self.target:
                self.buffer.reset()
            self.buffer.frame(index, image)
            if timestamp - self.last_feed >= 0.18:
                self.put_reply({"type": "faces", "generation": self.generation, "tracks": tracks})
                self.last_feed = timestamp
            if self.target and self.target not in self.faces.tracks:
                self.pause("Selected face was lost; select it again")
                return
        elif self.target and not self.paused:
            pcm = np.frombuffer(packet.payload, dtype="<f4").copy()
            if self.flow_paused:
                self.reserve_samples += pcm.size
                if self.reserve_samples > 3200:
                    if self.config.source == "replay":
                        raise ValueError("Replay ignored processing backpressure")
                    self.end(self.accepted_end)
                    self.flow(True, "device_cannot_keep_up")
                    return
            self.buffer.audio(packet.sample_start, packet.capture_time, pcm)
            self.accepted_end = packet.sample_start + pcm.size
        self.pump()

    def pump(self):
        if not self.target or self.finishing:
            return
        while self.pending < 2:
            window = self.buffer.window(final=self.end_sample is not None)
            if window is None:
                break
            track = self.faces.tracks.get(self.target) or self.last_track
            if track is None:
                self.pause("Selected face was lost; select it again")
                return
            copied = FaceTrack(track.id, list(track.observations), track.manual)
            self.last_track = copied
            generation = self.generation
            self.pending += 1
            try:
                self.owner.submit(
                    lambda w=window, t=copied, g=generation: self.infer(w, t, g), live=True
                )
            except ServiceError:
                self.pending -= 1
                raise
        if self.pending >= 2:
            self.flow(True)
        elif self.end_sample is None:
            self.flow(False)
        if self.end_sample is not None and self.buffer.sample_count == 0 and self.pending == 0:
            self.finishing = True
            generation = self.generation
            end = self.end_sample
            self.owner.submit(lambda: self.drain(end, generation), live=True)

    def _processor(self, generation):
        if self.processor is None:
            self.processor = StreamProcessor(self.owner.separator, self.profile)
        if self.processor.generation != generation:
            self.processor.reset(generation)
        return self.processor

    def deliver(self, results, generation):
        for item in results:
            span = item.span
            self.post(
                {
                    "type": "audio",
                    "generation": generation,
                    "start_sample": span.start_sample,
                    "sample_count": span.pcm.size,
                    "sample_rate": 16000,
                    "capture_spans": [asdict(s) for s in item.captures],
                    "device": self.owner.separator.device,
                    "timings": item.timings,
                    "queued_windows": self.owner.queue.qsize(),
                    "pcm": base64.b64encode(span.pcm.astype("<f4").tobytes()).decode("ascii"),
                }
            )

    def infer(self, window, track, generation):
        try:
            if self.cancel.is_set() or generation != self.generation:
                return
            results = self._processor(generation).process(window, track, generation)
            if not self.cancel.is_set() and generation == self.generation:
                self.deliver(results, generation)
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
        if not self.cancel.is_set():
            try:
                self.pump()
            except Exception as exc:
                self.put_reply(
                    {
                        "type": "error",
                        "code": "live_input_failed",
                        "message": str(exc),
                        "generation": self.generation,
                    }
                )

    def end(self, source_end_sample):
        if self.end_sample is not None:
            return
        if source_end_sample is None or source_end_sample != self.accepted_end:
            raise ValueError("End sample does not match accepted source audio")
        self.end_sample = source_end_sample
        self.pump()

    def drain(self, end, generation):
        try:
            if self.cancel.is_set() or generation != self.generation:
                return
            self.deliver(self._processor(generation).finish(end), generation)
            self.post({"type": "drained", "generation": generation, "source_end_sample": end})
        except Exception as exc:
            self.post(
                {
                    "type": "error",
                    "code": "drain_failed",
                    "message": str(exc),
                    "generation": generation,
                }
            )

    async def close(self):
        self.cancel.set()
        self.generation += 1
        self.buffer.reset()
        await self.loop.run_in_executor(self.executor, self.faces.close)
        await asyncio.to_thread(self.executor.shutdown, wait=True, cancel_futures=True)
        if self.processor:
            # Queue disposal behind all running inference so native state cannot race.
            if self.owner.thread.is_alive() and not self.owner.stopping.is_set():
                future = self.loop.create_future()

                def dispose():
                    self.processor.close()
                    self.loop.call_soon_threadsafe(future.set_result, None)

                while self.owner.queue.full():
                    await asyncio.sleep(0.02)
                self.owner.submit(dispose, live=True)
                await future
            else:
                self.processor.close()
