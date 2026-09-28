# Eye Tracker V2 Process

This note tracks the transcript-driven V2 eye-tracker sequence we are implementing.

## Transcript Steps

1. Start from a raw near-eye camera frame and select an ROI around the eye.
2. Use sparse sampling to find the darkest stable pupil seed.
3. Use binary thresholding from that seed to determine the pupil contour.
4. Refine contour points so the remaining contour behaves like an inward-facing ellipse.
5. Fit a pupil ellipse to the refined contour.
6. Use multiple pupil ellipses to estimate the 2D eye center.
7. Use the 2D eye center and pupil center to build the 3D gaze ray.

## Current Implementation

- `/v2/eye-tracker` keeps the existing source and ROI flow.
- USB camera setup checks browser camera exposure capabilities and can request auto/manual exposure when supported.
- Sparse sampling samples the ROI in 5 x 5 blocks and proposes multiple candidate regions.
- Candidate contours are scored by contour confidence, seed confidence, distance from the previous pupil, and edge penalties.
- The tracker keeps moving continuously; low-confidence candidates update cautiously instead of freezing the point.
- The pupil contour step uses a binary threshold search around the sparse-sampling seed.
- The selected contour reports threshold, pupil pixel count, contour point count, center, confidence, and mask preview.

## Reference

- Original concept reference: https://github.com/JEOresearch/EyeTracker/tree/main/3DTracker
