# Remote eye tracking V3

The public `/trials/remote-eye-tracking` route offers **Mobile eye tracker**,
**Webcam-based eye tracker**, and **IR webcam-based eye tracker**. `/trials` aliases
the existing `/trial` page and links to this flow. The isolated implementation
lives on `codex/v3-webcam-gaze`; the existing near-eye tracker remains available.

## Run locally

```sh
cd ~/Desktop/Codex-projects/gaze-core-v3/frontend
bun install --frozen-lockfile
bun run dev --host 0.0.0.0 --port 4003
```

On the computer, open `http://localhost:4003/trials/remote-eye-tracking`.
A phone requires **trusted HTTPS**; `http://<computer-LAN-IP>:4003` is not a secure
camera origin. Use an existing HTTPS deployment or supply a certificate trusted
by the phone and matching the computer's hostname/IP:

```sh
GAZE_DEV_TLS_CERT=/absolute/path/to/certificate.pem \
GAZE_DEV_TLS_KEY=/absolute/path/to/private-key.pem \
bun run dev --host 0.0.0.0 --port 4003
```

Open `https://<certificate-hostname>:4003/trials/remote-eye-tracking` on the same
network. Certificate trust must be configured normally on the device. No browser
security checks are bypassed by the application. Never commit a certificate key.
For a static production build, run `bun run build`; serve `frontend/apps/web/dist`
over HTTPS with SPA route fallback and the included `/models/` assets.

## Tracking approaches

| Mode   | Eye signal                                                   | Motion compensation                                                                    | Requirements                                                                  |
| ------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Mobile | MediaPipe face/iris plus pretrained BlazeGaze eye appearance | Face rotation/position/scale, inverse-scale and phone pose/gaze interactions           | Modern phone browser, selfie camera, trusted HTTPS                            |
| Webcam | Same local appearance backbone plus eye geometry             | Face rotation/position/scale and desktop head/gaze interactions                        | Both eyes resolved, stable camera above screen                                |
| IR     | OpenCV pupil ellipse and fresh compact corneal reflection    | Pupil-to-reflection displacement, reference translation/scale and interaction features | Compatible IR eye view with one identifiable reflection; selected one-eye ROI |

The RGB paths use different feature mappings and backend preferences; they are
not independently trained phone/desktop networks. Mobile prefers single-thread
WASM, desktop prefers WebGL, with visible backend identity in exported observations.
All models and WASM are same-origin assets. A missing model never silently turns
into an iris-only tracker. IR never pretends a single eye view provides full 6-DoF
head rotation. A regular webcam advertised as IR-compatible is insufficient if
it cannot show a usable pupil and corneal reflection.

## Head-aware calibration

1. Start the camera explicitly, then check eyes and live head/reference motion.
2. Follow nine screen targets. Each target retains 18 fresh eye/pose frames after
   a 700 ms settling period; blinking, lost faces/references, and stale frames do
   not advance capture. Head motion is **not** rejected or averaged into a single
   target feature.
3. The recommended second pass repeats all nine targets with gentle head turns
   or shifts while fixating. This helps separate eye motion from head motion and
   expands observed pose coverage. It does not require identical poses across
   targets or estimate new labels from live predictions.
4. Fit a standardized, target-balanced ridge mapping locally. Regularization is
   selected by holding out entire target groups, including their repeated passes.
   Constant inputs, insufficient screen coverage, and poor held-out fits fail.
5. Validate on five new locations. Results separately report mean/RMS/95th
   percentile pixel error and within-target jitter. Validation frames do not train
   the calibration. Export retains raw synchronized samples and model parameters.
6. Every live prediction checks the current head/reference range. Outside the
   observed joint poses plus a small neighborhood, output pauses and offers labeled recalibration.
   Separate axis bounds and proximity to actual sampled pose combinations are checked. This envelope is a conservative extrapolation check, not an accuracy guarantee.

The screen mapping is invalidated by camera/ROI/threshold changes, screen resize
or orientation, and hiding the page. Backgrounding releases the camera. Stop,
permission failures, disconnections, model failures, and unmount release resources;
late permission responses are stopped rather than activating abandoned sessions.
One transferred bitmap is in flight at a time and is closed by the worker.

## Research decisions and limits

[MobilePoG (Zhao et al., 2025)](https://arxiv.org/html/2508.10268v1) reports that
diverse calibration poses improve generalization across poses. This informs the
second head-movement pass and per-frame pose features; our implementation has not
reproduced that paper's dataset evaluation or dynamic-phone protocol.

[WebEyeTrack (Davalos et al., 2025)](https://arxiv.org/html/2508.19544v1) supplies
a compact browser appearance model with head orientation and face-origin inputs.
We preserve its preprocessing and use the published weights, adding local
pose-aware screen calibration rather than claiming its reported accuracy transfers
to every device. The approximate reconstruction inputs are model features, not
measured physical eye origins. See [asset provenance and license notices](../research/WebEyeTrack-NOTICE.md).

[Smartphone research (Valliappan et al., 2020)](https://www.nature.com/articles/s41467-020-18360-5)
establishes the feasibility of personalized RGB phone tracking under controlled
conditions. Its study results do not establish this browser implementation's error.
[Remote PCCR geometry (Guestrin and Eizenman, 2006)](https://pubmed.ncbi.nlm.nih.gov/16761839/)
motivates the separate IR approach. Camera, emitter, and screen geometry are needed
for physical 3D interpretation.

The current output is **2D calibrated screen gaze**, not a measured physical
pupil gaze ray. Landmark iris tracking alone is not gaze estimation. Near-eye
camera quality cannot be promised from a distant RGB webcam. Tests establish
geometry, calibration, model loading and lifecycle behavior; held-out hardware
measurements are still needed for accuracy and latency across target devices.
RGB code is MIT, runtime code is Apache-2.0; commercial rights for the supplied
weights and their training data have not been established by this work. This is
a research trial until device validation and model licensing are resolved.

## Hardware acceptance before production

Measure repeated five-target sessions on target iOS/Android browsers, laptop and
USB webcams, and the intended IR camera. Record raw mean/p95 error, jitter, processing
time and delivered fps; repeat at multiple head rotations/translations, illumination,
glasses and camera distances. Test permission denial, background/foreground, USB
unplug, portrait/landscape changes and near-edge targets. Use error distributions
to choose interaction target sizes and deployment acceptance thresholds. No
synthetic test score should be reported as real-camera gaze accuracy.

## Verification record (2026-10-01)

- Full frontend Bun suite: **201 passed, 0 failed**, across 23 files.
- Full frontend lint and production build passed; build includes referenced TypeScript projects and module-worker chunks.
- Actual Chromium workers initialized mobile, webcam, and IR modes. Bundled RGB weights executed through both WASM and WebGL; all inference asset requests stayed on the app origin. Blank frames correctly yielded no eye signal.
- Rendered at desktop and 390 px phone width; phone cards stack, visible buttons are at least 44 px tall, and the page has no horizontal overflow.
- Fresh review findings were fixed with regression checks: duplicated physical video frames, stale gaze, unsupported joint head poses, native matrix convention, and flow recovery after resize or camera loss.
- No real-human camera accuracy, Safari/iOS device latency, or commercial-weight clearance was established by these checks.
