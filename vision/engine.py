"""YOLOE visual proposals with independent geometric instance verification."""

import os
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / ".local-reference"
(LOCAL / "vision-config").mkdir(parents=True, exist_ok=True)
os.environ["YOLO_CONFIG_DIR"] = str(LOCAL / "vision-config")
os.environ["MPLCONFIGDIR"] = str(LOCAL / "vision-config" / "matplotlib")
os.environ["YOLO_AUTOINSTALL"] = "false"
os.environ["YOLO_OFFLINE"] = "true"

import numpy as np  # noqa: E402
import torch  # noqa: E402
from ultralytics import YOLOE, settings  # noqa: E402
from ultralytics.models.yolo.yoloe import YOLOEVPSegPredictor  # noqa: E402

from appearance import choose_appearance  # noqa: E402
from context_acquisition import ContextAcquisition  # noqa: E402
from matching import Candidate, Reference, choose_match, valid_box  # noqa: E402
from memory_tracking import MemoryTracker  # noqa: E402
from prepare import MODELS, verify  # noqa: E402
from sessions import Sessions  # noqa: E402


class VisionEngine:
    def __init__(self):
        import json

        for asset in json.loads(Path(__file__).with_name("assets.json").read_text()):
            if not verify(MODELS / asset["name"], asset["sha256"]):
                raise RuntimeError(
                    "Vision models missing. Run uv run --project vision vision/prepare.py."
                )
        settings.update(
            {
                key: False
                for key in (
                    "sync",
                    "wandb",
                    "mlflow",
                    "tensorboard",
                    "comet",
                    "clearml",
                    "neptune",
                    "dvc",
                )
                if key in settings
            }
        )
        torch.set_num_threads(4)
        import cv2

        cv2.setNumThreads(4)
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        from learned_appearance import AppearanceModel
        from segmentation import SegmentationModel

        self.segmentation = SegmentationModel(self.device)
        self.appearance = AppearanceModel(self.device)
        self.detector = YOLOE(str(MODELS / "yoloe-26n-seg-pf.pt"))
        self.visual = YOLOE(str(MODELS / "yoloe-26n-seg.pt"))
        self.sessions = Sessions()
        self.active = None
        self.options = {
            "imgsz": 640,
            "device": self.device,
            "verbose": False,
            "save": False,
            "conf": 0.25,
            "max_det": 20,
            "rect": False,
        }
        warm = np.zeros((480, 640, 3), np.uint8)
        empty_memory = {"cond_frame_outputs": {}, "non_cond_frame_outputs": {}}
        initial = self.segmentation.predict(warm, [0.1, 0.1, 0.6, 0.6], 0, empty_memory)
        empty_memory["cond_frame_outputs"][0] = initial.memory
        self.segmentation.predict(warm, None, 1, empty_memory)
        self.appearance.score(warm[:64, :64], warm[:64, :64])
        self.detector.predict(warm, **self.options)
        self.visual.predict(
            warm,
            refer_image=warm,
            visual_prompts={"bboxes": np.array([[80, 80, 400, 400]]), "cls": np.array([0])},
            predictor=YOLOEVPSegPredictor,
            **self.options,
        )

    def status(self):
        return {
            "status": "ready",
            "model": "YOLOE-26n + SAM 2.1 Tiny + DINOv2",
            "device": self.device,
        }

    def select(self, image, point, box):
        height, width = image.shape[:2]
        label = "Selected object"
        if box is None:
            if (
                not isinstance(point, list)
                or len(point) != 2
                or not all(
                    isinstance(x, (float, int))
                    and not isinstance(x, bool)
                    and np.isfinite(x)
                    and 0 <= x <= 1
                    for x in point
                )
            ):
                raise ValueError("Click an object or drag a box in Scene.")
            prediction = self.detector.predict(image, **self.options)[0]
            contained = []
            for detected in prediction.boxes:
                x1, y1, x2, y2 = detected.xyxy[0].cpu().tolist()
                if x1 <= point[0] * width <= x2 and y1 <= point[1] * height <= y2:
                    contained.append(
                        (
                            (x2 - x1) * (y2 - y1),
                            (x1 / width, y1 / height, x2 / width, y2 / height),
                            prediction.names[int(detected.cls[0])],
                        )
                    )
            if not contained:
                raise ValueError("No object detected here. Drag a box around it, then Select.")
            _, box, label = min(contained, key=lambda item: item[0])
        box = valid_box(box)
        if (box[2] - box[0]) * width < 12 or (box[3] - box[1]) * height < 12:
            raise ValueError("Choose a larger object rectangle.")
        reference = Reference(image, box)
        pixels = np.array([[box[0] * width, box[1] * height, box[2] * width, box[3] * height]])
        self.visual.predict(
            image,
            refer_image=image,
            visual_prompts={"bboxes": pixels, "cls": np.array([0])},
            predictor=YOLOEVPSegPredictor,
            **self.options,
        )
        embedding = self.visual.model.pe.detach().clone()
        scene = MemoryTracker(
            image, box, backend=self.segmentation, reference=reference, appearance=self.appearance
        )
        token = self.sessions.add(
            {
                "reference": reference,
                "embedding": embedding,
                "label": label,
                "scene": scene,
                "target": None,
                "stream": None,
                "context_acquisition": ContextAcquisition.create(
                    image, box, reference, scene.outputs["cond_frame_outputs"][0], self.segmentation
                ),
            }
        )
        self.active = token
        return {"token": token, "box": list(box), "label": label}

    def track(self, token, image):
        selected = self.sessions.get(token)
        result = selected["scene"].update(image)
        if result["status"] == "matched":
            return result
        if selected["scene"].active or selected["scene"].recovering:
            return result
        acquired = self.find(token, image)
        if acquired["status"] == "matched":
            try:
                selected["scene"] = MemoryTracker(
                    image,
                    acquired["box"],
                    backend=self.segmentation,
                    reference=selected["reference"],
                    appearance=self.appearance,
                )
            except ValueError:
                return {"status": "searching"}
        return acquired

    def match(self, token, image, stream=0):
        selected = self.sessions.get(token)
        if selected["stream"] != stream:
            selected["target"] = None
            selected["stream"] = stream
            if selected.get("context_acquisition") is not None:
                selected["context_acquisition"].reset()
        tracker = selected["target"]
        if tracker is not None:
            result = tracker.update(image)
            if result["status"] == "matched":
                return result
            if tracker.active or tracker.recovering:
                return result
        context_result = None
        context = selected.get("context_acquisition")
        if context is not None:
            result = context.update(image)
            if result["status"] == "matched":
                acquisition = result.pop("acquisition")
                try:
                    selected["target"] = MemoryTracker(
                        image,
                        result["box"],
                        backend=self.segmentation,
                        reference=selected["reference"],
                        appearance=self.appearance,
                        acquisition=acquisition,
                    )
                except ValueError:
                    return {"status": "searching"}
                return result
            context_result = result
        result = self.find(token, image)
        if result["status"] == "matched":
            try:
                selected["target"] = MemoryTracker(
                    image,
                    result["box"],
                    backend=self.segmentation,
                    reference=selected["reference"],
                    appearance=self.appearance,
                )
            except ValueError:
                return {"status": "searching"}
        if result["status"] == "searching" and context_result is not None:
            return context_result
        return result

    def find(self, token, image):
        selected = self.sessions.get(token)
        deadline = time.monotonic() + 0.25
        # Reacquisition must use the user's immutable selection. Recent temporal
        # crops can be contaminated by drift, even when a model score stays high.
        reference = selected["reference"]
        # Try cheap global corroboration first. Proposal inference and dense
        # searches must not multiply across every reference and candidate.
        result = choose_match(reference, image, [Candidate((0, 0, 1, 1), 0.0)], deadline=deadline)
        if result["status"] != "searching":
            return result
        if time.monotonic() >= deadline:
            return {"status": "searching"}
        result = choose_appearance(reference, image)
        if result["status"] != "searching":
            return result
        if time.monotonic() >= deadline:
            return {"status": "searching"}
        if self.active != token:
            self.visual.set_classes(["selected object"], selected["embedding"])
            self.active = token
        prediction = self.visual.predict(image, **self.options)[0]
        height, width = image.shape[:2]
        candidates = []
        for detected in prediction.boxes[:5]:
            x1, y1, x2, y2 = detected.xyxy[0].cpu().tolist()
            box = tuple(
                max(0, min(1, value))
                for value in (x1 / width, y1 / height, x2 / width, y2 / height)
            )
            if box[2] > box[0] and box[3] > box[1]:
                candidates.append(Candidate(box, float(detected.conf[0])))
        return choose_match(reference, image, candidates, deadline=deadline)

    def expire(self):
        self.sessions.expire()
        if self.active not in self.sessions.items:
            self.active = None
            self.visual.predictor = None
            self.detector.predictor = None

    def clear(self, token):
        self.sessions.clear(token)
        self.expire()
