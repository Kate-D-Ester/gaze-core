"""Local DINOv2 evidence for brief recovery; cosine is not identity probability."""

import cv2
import numpy as np
import timm
import torch
from torch.nn import functional as F

from prepare import MODELS


class AppearanceModel:
    def __init__(self, device):
        self.device = device
        self.model = timm.create_model(
            "vit_small_patch14_dinov2.lvd142m",
            pretrained=False,
            num_classes=0,
            dynamic_img_size=True,
        )
        weights = torch.load(MODELS / "dinov2_vits14.pt", map_location="cpu", weights_only=True)
        # Meta's training-only masked-patch token is not used by timm inference.
        mask_token = weights.pop("mask_token")
        if tuple(mask_token.shape) != (1, 384):
            raise RuntimeError("Invalid DINOv2 mask token.")
        self.model.load_state_dict(weights, strict=True)
        self.model = self.model.to(device).eval()
        self.mean = torch.tensor([0.485, 0.456, 0.406], device=device)[None, :, None, None]
        self.std = torch.tensor([0.229, 0.224, 0.225], device=device)[None, :, None, None]

    @torch.inference_mode()
    def score(self, previous, current):
        images = [
            cv2.cvtColor(cv2.resize(image, (224, 224)), cv2.COLOR_BGR2RGB)
            for image in (previous, current)
        ]
        tensor = (
            torch.from_numpy(np.stack(images))
            .permute(0, 3, 1, 2)
            .to(device=self.device, dtype=torch.float32)
            / 255
        )
        descriptors = F.normalize(self.model((tensor - self.mean) / self.std), dim=-1)
        return float((descriptors[0] @ descriptors[1]).clamp(-1, 1).item())
