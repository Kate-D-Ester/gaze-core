# Pinned hand model

- Google MediaPipe Hand Landmarker, float16 model version 1.
- Source: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
- SHA-256: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`
- Model guide/card: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
- Runtime: `@mediapipe/tasks-vision` 0.10.32, Apache-2.0, copyright Google/MediaPipe contributors. Generated worker and WASM assets are copied from that pinned package at dev/build time.
- Upstream project/license: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE

The model is served locally. The installed package's WASM loader uses `importScripts`, so `scripts/prepare-vision.ts` compiles the TypeScript hand worker to a classic IIFE worker; no library patches are applied.
