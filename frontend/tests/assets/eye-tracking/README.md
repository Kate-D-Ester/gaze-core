# Eye tracking reference videos

The upstream eye tracking test clip is paired with the tracker's rendered output. Both overlays were generated with tracker code at revision [`6ba620f`](https://github.com/Kate-D-Ester/gaze-core/commit/6ba620f5744ff9095bf088aef8a066054eb7d634). This asset-only commit adds the source clips, their overlays, and this provenance note; it does not include the separate calibration changes in the working tree.

| Pair | Source video | Overlay partner | Processing and observed result |
| --- | --- | --- | --- |
| Upstream eye tracking test | [`eye_tracking_test_source.mp4`](eye_tracking_test_source.mp4) | [`eye_tracking_test_overlay_at_6ba620f.mp4`](eye_tracking_test_overlay_at_6ba620f.mp4) | The source is `eye_test.mp4` from [JEOresearch/EyeTracker](https://github.com/JEOresearch/EyeTracker), used under the repository's MIT license. The 640 × 480 clip was sampled at 24 fps as nine segments, resetting at montage cuts. The tracker accepted 995 of 1,033 sampled frames (96.3% coverage). Long gaps remain during severe occlusion, particularly frames 902–904 and 921–934. |

Accepted-frame counts describe coverage, not accuracy. Ellipse portions hidden by lids, lashes, reflections, or blur may be inferred from the visible pupil rim; the hidden boundary cannot be verified from the image alone. The overlay headers identify inferred shapes where available. These outputs document the tracker at revision `6ba620f`; they are not a guarantee for other cameras or lighting.


## SHA-256

| File | SHA-256 |
| --- | --- |
| `eye_tracking_test_source.mp4` | `5a464ca38fbe6dfabaead35ca51a1152df4df76a5842c035bcb58dcf0e587eaa` |
| `eye_tracking_test_overlay_at_6ba620f.mp4` | `3bcab633568020f24ed3c15d1252ff5fdbc079c4aace6bf6975cd680f2909afb` |
