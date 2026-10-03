"""Timestamp-paced mixed-video replay; never a physical microphone/ESP32 benchmark."""

import argparse
import asyncio
import base64
import hashlib
import json
from pathlib import Path
from time import monotonic

import cv2
import numpy as np
import psutil
import soundfile as sf
from websockets.asyncio.client import connect

from .stream_protocol import encode_packet
from .media import decode_media

REFERENCE = (
    Path.home()
    / "Desktop/Codex-projects/scene-speech-reference/cnn-debate-low-quality-320x180-15fps.mp4"
)


async def replay(path: Path, destination: Path, origin: str, pid: int | None):
    media = decode_media(path)
    destination.mkdir(parents=True, exist_ok=True)
    report = {
        "input_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "mixed_pcm_sha256": hashlib.sha256(media.audio.astype("<f4").tobytes()).hexdigest(),
        "duration": media.duration,
        "kind": "timestamp-paced mixed debate, not physical camera/microphone",
        "window_seconds": 2,
        "stride_seconds": 1,
        "playout_seconds": 4,
        "outputs": [],
        "errors": [],
        "switches": [],
        "rejected_old_outputs": 0,
    }
    generation, phase, target = 0, 0, None
    tracks = []
    begin = monotonic()
    peak = 0
    points = [(0.22, 0.35), (0.485, 0.30), (0.79, 0.30)]
    async with connect("ws://127.0.0.1:4033/live", origin=origin, max_size=524288) as socket:
        await socket.send(
            json.dumps(
                {
                    "type": "configure",
                    "sample_rate": 16000,
                    "audio": True,
                    "source": "replay",
                    "sync_verified": True,
                    "video_offset_ms": 0,
                    "client_time": begin,
                }
            )
        )
        ready = json.loads(await socket.recv())
        if ready.get("type") != "ready":
            raise RuntimeError(ready)
        report["device"] = ready["device"]
        report["connection_setup_seconds"] = monotonic() - begin
        begin = monotonic()

        async def select():
            nonlocal generation, target
            x, y = points[phase]
            matches = [
                t
                for t in tracks
                if t["observations"][0]["box"][0] <= x <= sum(t["observations"][0]["box"][::2])
                and t["observations"][0]["box"][1] <= y <= sum(t["observations"][0]["box"][1::2])
            ]
            if len(matches) != 1:
                return
            target = matches[0]["id"]
            generation += 1
            await socket.send(
                json.dumps({"type": "target", "generation": generation, "target_id": target})
            )
            report["switches"].append(
                {
                    "phase": phase,
                    "generation": generation,
                    "at_seconds": monotonic() - begin,
                    "target_id": target,
                }
            )

        async def receive():
            nonlocal tracks, generation, target, peak
            async for message in socket:
                reply = json.loads(message)
                if pid:
                    peak = max(peak, psutil.Process(pid).memory_info().rss)
                if reply["type"] == "faces":
                    if reply["generation"] == generation:
                        tracks = reply["tracks"]
                        if target is None:
                            await select()
                elif reply["type"] == "error":
                    report["errors"].append({**reply, "at_seconds": monotonic() - begin})
                    print(json.dumps(reply), flush=True)
                    (destination / "failure.json").write_text(json.dumps(report, indent=2))
                    generation = max(generation, reply["generation"]) + 1
                    target = None
                    await socket.send(
                        json.dumps({"type": "target", "generation": generation, "target_id": None})
                    )
                elif reply["type"] == "audio":
                    if reply["generation"] != generation:
                        report["rejected_old_outputs"] += 1
                        continue
                    pcm = np.frombuffer(base64.b64decode(reply.pop("pcm")), dtype="<f4").copy()
                    if pcm.shape != (16000,) or not np.isfinite(pcm).all():
                        raise ValueError("Invalid genuine live audio")
                    elapsed = monotonic() - begin
                    filename = f"phase-{phase}-chunk-{len(report['outputs']):03}.wav"
                    sf.write(destination / filename, pcm, 16000, subtype="FLOAT")
                    report["outputs"].append(
                        {
                            **reply,
                            "phase": phase,
                            "received_seconds": elapsed,
                            "transport_delay_seconds": monotonic() - reply["start"],
                            "sha256": hashlib.sha256(pcm.tobytes()).hexdigest(),
                            "file": filename,
                        }
                    )

        receiver = asyncio.create_task(receive())
        # Audio/video share one source presentation clock and the original mixed PCM.
        events = [(i / 16000, 1, i) for i in range(0, media.audio.size - 1599, 1600)]
        events += [(float(t), 2, i) for i, t in enumerate(media.timestamps)]
        events.sort(key=lambda item: (item[0], -item[1]))
        for timestamp, kind, index in events:
            await asyncio.sleep(max(0, begin + timestamp - monotonic()))
            next_phase = min(2, int(timestamp // (media.duration / 3)))
            if next_phase != phase:
                phase = next_phase
                target = None
                generation += 1
                await socket.send(
                    json.dumps({"type": "target", "generation": generation, "target_id": None})
                )
                if phase == 2:
                    await socket.send(
                        json.dumps({"type": "region", "box": [0.65, 0.08, 0.32, 0.53]})
                    )
                else:
                    await select()
            if kind == 1:
                payload = media.audio[index : index + 1600].astype("<f4").tobytes()
            else:
                success, jpeg = cv2.imencode(
                    ".jpg",
                    cv2.cvtColor(media.frames[index], cv2.COLOR_RGB2BGR),
                    [cv2.IMWRITE_JPEG_QUALITY, 70],
                )
                if not success:
                    raise ValueError("Replay JPEG encoding failed")
                payload = jpeg.tobytes()
            await socket.send(encode_packet(kind, generation, begin + timestamp, payload))
            if receiver.done():
                await receiver
                break
        await asyncio.sleep(3)
        await socket.send(json.dumps({"type": "stop"}))
        await receiver
    timings = [o["processing_seconds"] for o in report["outputs"]]
    delays = [o["transport_delay_seconds"] for o in report["outputs"]]
    report["elapsed_seconds"] = monotonic() - begin
    report["peak_server_rss_bytes"] = peak
    report["output_seconds"] = len(timings)
    report["inference_median_seconds"] = float(np.median(timings)) if timings else None
    report["inference_p95_seconds"] = float(np.percentile(timings, 95)) if timings else None
    report["arrival_delay_p95_seconds"] = float(np.percentile(delays, 95)) if delays else None
    report["phases_with_output"] = sorted({o["phase"] for o in report["outputs"]})
    report["sustained"] = bool(
        timings
        and report["phases_with_output"] == [0, 1, 2]
        and all(o.get("queued_windows", 0) <= 2 for o in report["outputs"])
        and max(delays) < 4
        and not any("overload" in e["message"].lower() for e in report["errors"])
    )
    (destination / "report.json").write_text(json.dumps(report, indent=2))
    print(
        json.dumps(
            {
                key: value
                for key, value in report.items()
                if key not in {"outputs", "errors", "switches"}
            },
            indent=2,
        )
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=REFERENCE)
    parser.add_argument("--output", type=Path, default=Path("data/benchmarks/live"))
    parser.add_argument("--origin", default="http://localhost:4001")
    parser.add_argument("--server-pid", type=int)
    args = parser.parse_args()
    asyncio.run(replay(args.input, args.output, args.origin, args.server_pid))


if __name__ == "__main__":
    main()
