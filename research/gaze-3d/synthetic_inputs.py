"""Synthetic numerical-parity fixtures. These contain no wearer measurements."""

import numpy as np


HEAD_ANGLES_DEGREES = [
    (0, 0, 0),
    (20, -15, 0),
    (-25, 10, 0),
    (15, 20, 12),
    (-30, -20, -10),
]


def synthetic_eye(pupil_x, pupil_y, skin_color):
    rows, columns = np.meshgrid(np.arange(60), np.arange(60), indexing="ij")
    canvas = np.empty((3, 60, 60), dtype=np.float32)
    eyelid = ((columns - 30) / 26) ** 2 + ((rows - 30) / 11) ** 2 < 1
    radius_squared = (columns - pupil_x) ** 2 + (rows - pupil_y) ** 2
    for channel, skin in enumerate(skin_color):
        canvas[channel] = skin
        canvas[channel, eyelid] = 225
        canvas[channel, (radius_squared < 64) & eyelid] = 45 + 5 * channel
        canvas[channel, (radius_squared < 16) & eyelid] = 12
    return canvas[None]


def synthetic_eye_pairs():
    rows, columns = np.meshgrid(np.arange(60), np.arange(60), indexing="ij")
    zero = np.zeros((1, 3, 60, 60), dtype=np.float32)
    flat = np.full_like(zero, 127)
    gradient = np.stack(
        [columns / 59 * 255, rows / 59 * 255, (columns + rows) / 118 * 255]
    )[None].astype(np.float32)
    checker = np.stack(
        [((columns // 5 + rows // 5 + channel) % 2) * 255 for channel in range(3)]
    )[None].astype(np.float32)
    noise = np.random.default_rng(901).integers(
        0, 256, size=(1, 3, 60, 60)
    ).astype(np.float32)
    left_skin = (145, 168, 190)
    right_skin = (140, 163, 187)
    return [
        ("zero", zero, zero),
        ("flat_127", flat, flat),
        ("asymmetric_gradients", gradient, gradient[:, :, :, ::-1].copy()),
        ("checker_vs_noise", checker, noise),
        (
            "synthetic_center",
            synthetic_eye(30, 30, left_skin),
            synthetic_eye(30, 30, right_skin),
        ),
        (
            "synthetic_shifted",
            synthetic_eye(22, 26, left_skin),
            synthetic_eye(23, 26, right_skin),
        ),
    ]
