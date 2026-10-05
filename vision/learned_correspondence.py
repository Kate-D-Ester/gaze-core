"""Local learned point correspondences; no category or identity probability."""

import copy

import cv2
import torch
from kornia.feature import LoFTR
from kornia.feature.loftr.loftr import default_cfg

from prepare import MODELS


def view_size(image):
    height, width = image.shape[:2]
    scale = 320 / max(height, width)
    return (max(8, round(width * scale / 8) * 8), max(8, round(height * scale / 8) * 8))


class LearnedCorrespondence:
    def __init__(self, device):
        self.device = device
        config = copy.deepcopy(default_cfg)
        config["coarse"]["temp_bug_fix"] = True
        self.model = LoFTR(pretrained=None, config=config)
        weights = torch.load(
            MODELS / "loftr_indoor_ds_new.ckpt", map_location="cpu", weights_only=True
        )
        self.model.load_state_dict(weights["state_dict"], strict=True)
        self.model = self.model.to(device).eval()

    def tensor(self, image):
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, view_size(image))
        gray = cv2.createCLAHE(2, (4, 4)).apply(gray)
        return torch.from_numpy(gray).to(self.device).float()[None, None] / 255

    @torch.inference_mode()
    def match(self, source, target):
        with torch.autocast(self.device, dtype=torch.float16, enabled=self.device == "mps"):
            output = self.model({"image0": self.tensor(source), "image1": self.tensor(target)})
        # Kornia applies its mutual coarse-match and confidence filters. Geometry
        # and spatial coverage still independently verify the selected region.
        first = output["keypoints0"].float().cpu().numpy() / view_size(source)
        second = output["keypoints1"].float().cpu().numpy() / view_size(target)
        return first, second
