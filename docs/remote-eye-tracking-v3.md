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
| IR | Automatic eye crops, OpenCV dark/bright pupil ellipses; optional observed glints | Full-face binocular pupil/canthus offsets and independently observed face pose; close-up PCCR uses reference translation/scale | Resolved pupils in the original camera image; close-up PCCR additionally requires a clear reflection |

The RGB paths use different feature mappings and backend preferences; they are
not independently trained phone/desktop networks. Mobile prefers single-thread
WASM, desktop prefers WebGL, with visible backend identity in exported observations.
All models and WASM are same-origin assets. A missing model never silently turns
into an iris-only tracker. Full-face IR uses the shared face/eyelid localizer to
propose two eye boxes, then crops the original source pixels and runs the normal
spatial pupil detector with automatic thresholding inside each crop. It does not
use inferred iris centers as pupil measurements or load the RGB appearance model.
Dark and bright pupil contrast are supported; saturated bright interiors are
rejected as ambiguous. Glints remain separately visible measurements but are not
required for full-face calibration. The feature representation remains fixed when
glints disappear. Missing pupils, blinks and lost faces clear gaze input.

A selected close-up eye region, or a sufficiently large single-eye view, uses
PCCR: pupil-to-reflection displacement and apparent scale. Pupil setup feedback
remains visible without a reflection, but calibrated close-up gaze requires a
fresh unambiguous reflection. This path cannot measure head rotation. Face and
close-up pipelines are kept separate through a calibration session.

The camera picker is available before Start. Discovery on mount and camera hotplug
does not request permission. Browsers may hide device identities before permission;
**Discover cameras** briefly requests video only, reveals choices, and releases the
stream without starting tracking models. Stop/unmount invalidate late grants.
Automatic IR thresholding is checked by default; the slider appears only when
turning off Auto. Manual eye region selection remains available for close-up cameras.

## Head-aware calibration

1. Select a camera before Start (use Discover cameras if browser permission hides the choices), then check measured pupils and live head/reference motion.
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

[PuRe (Santini et al.)](https://arxiv.org/html/1712.08900) motivates the eye-image
scale assumptions and reversed contrast for bright-pupil detection. We use the
existing spatial detector with contrast inversion; this is not a PuRe port.
[Pupil Capture documentation](https://docs.pupil-labs.com/core/software/pupil-capture/#fine-tuning-pupil-detection)
explains how sensor resolution and exposure affect pupil detection. Preserving
source-resolution eye crops is an engineering correction to the original full-frame
downscale. The bundled face model's robustness on the intended NIR feed still
requires measurement; it is not trained specifically for that camera by this work.

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

## IR and camera discovery correction (2026-10-01)

The original IR trial assumed a near-eye crop and discarded all visual feedback
without a reflection. On a full-camera view this sacrificed pupil resolution and
required a signal the camera might not supply. The correction localizes eye regions,
retains source-resolution pupil pixels, supports dark/bright contrast, and uses
face-referenced pupil gaze when the whole face is visible. Separate close-up PCCR
behavior and its reflection requirement are preserved.

Regression checks exercise real OpenCV on source-resolution synthetic pixels,
missing glints, pupil loss, bright pupils, independent head pose, and camera
permission/hotplug/disposal races. Synthetic face-locator fixtures verify crop and
feature plumbing; they do not establish NIR face-model performance, textured-eye
accuracy or actual hardware gaze error. Re-run held-out validation on the real IR
camera before comparing it with the working RGB setup.

Verified after the correction: **245 Bun tests passed**, full frontend lint and
production build passed. A Chromium browser check initialized the actual IR worker
and local face model, rejected a blank frame, and processed synthetic pupil/glint
pixels using automatic thresholding. The real IR camera check remained pending
browser camera permission; no physical-camera gaze accuracy is claimed.


## Continuous IR pupil tracking correction (2026-10-01)

IR now uses the same stateful pupil pipeline as `/trials`, extracted into one
shared `PupilTracker` used by the normal engine and each IR eye. Full-face IR keeps
two independent tracks; close-up history no longer disappears with a missing
glint. Initial acquisition validates a full pupil, while subsequent frames can
measure current visible rim arcs with the previously observed shape. The detector
refreshes shape periodically, confirms unsupported relocations, and performs
bounded reacquisition. Missing pixels still clear the current result immediately;
history seeds new measurements rather than supplying stale gaze.

Current eye-corner geometry remaps the IR history through crop translation,
head scale and roll. Pupil size bounds are separate from allowed eye travel.
The IR face localizer permits partially open eyes and leaves actual pupil
acceptance to source-resolution pixels; fully closed geometry still clears input.
The RGB/mobile blink rules are unchanged.

Bright-pupil tracking retains accepted full-rim brightness and a glare ceiling
while an eyelid hides the pupil center. This prevents a visible lower cap or a
saturated lid from becoming a smaller displaced full pupil. A newly visible,
independently supported full rim refreshes exposure, including simultaneous pupil
motion. A bounded exposure recovery profile must preserve both axes; a strong
photometric score alone cannot overwrite a partial track. The close-up PCCR
requirement for a fresh reflection remains in place.

Regression coverage includes moving dark/bright pupils without glints, binocular
partial occlusion, bright pupils inside a separately dark iris and lid, head
scale/roll, blink and history expiry, polarity reversal, and combined exposure
and eye movement. Real OpenCV runs on synthetic pixels; these checks are separate
from physical-camera calibration accuracy.

The production IR module worker also passed a Chromium check of **80 synthetic
frames**, covering moving pupils, partial eyelids, missing glints, blink clearing,
bright-pupil cap rejection and immediate exposure recovery. No live IR camera
recording or human gaze-accuracy measurement was available during this correction.

Final verification: **261 Bun tests passed across 26 files**, with 0 failures.
Full frontend lint, TypeScript/production build and whitespace checks passed.
The local tracker route returned HTTP 200 on port 4003.
