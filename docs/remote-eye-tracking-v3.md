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

## Reference-video pupil pipeline (2026-10-02)

The two supplied 1280 × 720, 30 fps recordings were decoded and processed through
real browser/OpenCV/MediaPipe inference, sequentially at each source frame time.
Both complete clips were checked: 1,217 frames (40.57 s) and 1,200 frames (40 s).
Recordings and per-frame biometric outputs remain local in the ignored
`frontend/node_modules/.cache/ir-reference-videos/` directory; none are bundled or
committed. No audio was used.

The pipeline now bounds candidates **before** ranking/recovery using the current
canthi/lid opening and pupil radius. Automatic threshold seeds come from this
opening rather than the darker surrounding lashes. Fresh native-pixel evidence
wins; when it fails, a 3 × 3 denoise and bounded percentile contrast transform
run only on the small eye crop, without resizing. Native and enhanced tracks keep
separate polarity, shape, and intensity histories, each remapped by current head
translation/scale/roll. Raw pixels still determine saturation and reflection
identity. Missing image evidence clears the result.

Bright sclera can resemble a bright pupil. Full-face auto acquisition therefore
checks a bright candidate against an independently measured enclosing dark iris,
or conservative uniform dark surroundings when its iris rim is outside the crop.
Established partial pupils retain their validated rim identity. A genuine pupil
containing a much smaller corneal glint is distinguished from an ellipse fitted
to the glint itself. Close-up and explicit-polarity behavior remain available.
An experimental opening-wide brightness veto was rejected: a separate shadow
can be darker than a genuine, independently supported pupil. Regression cases
cover both mild and strong uneven illumination without that veto.

[ElSe (Fuhl et al., 2015)](https://arxiv.org/pdf/1511.06575) informed the use of
normalization, filtered edge/ellipse evidence and plausibility checks. This is an
extension of the shared existing detector, not a port or reproduction of ElSe's
published accuracy. The two videos were used for engineering evaluation; no new
learned model was trained on them.

| Recording | Frames | Both pupils before → after | Any pupil before → after | Face frames after | Median processing | p95 processing |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Off-axis lighting (`01-53-37`) | 1,217 | 0 → 479 | 173 → 1,033 | 1,213 | 32.5 ms | 44.2 ms |
| Light directed at eyes (`01-55-24`) | 1,200 | 474 → 865 | 917 → 1,081 | 1,200 | 30.4 ms | 43.5 ms |

These are **reported-detection counts, not labeled accuracy or visible-pupil
recall**. Visual crop/overlay inspection exposed bright-surface false positives
and led to the iris-support correction. Residual misses and occasional incorrect
fits remain in blur, glare, occlusion and faint rims; every visible pupil has not
been established as correctly detected. There are no synchronized screen-target
labels in these recordings, so they cannot establish calibrated gaze accuracy.
Do not compare these counts with held-out pixel/angular screen error.

To inspect a recording, open `/trials/remote-eye-tracking`, select IR, and use the
file-video icon beside **Change setup**. The file stays in a local object URL;
no camera permission or upload is needed. Native controls play/pause/seek. Paused
ROI/threshold changes reprocess the selected frame. Seek and settings resets clear
worker history and stale results; model setup can briefly pause playback. Stop,
source replacement, media failure and unmount release the object URL and worker.
Results expire after one second without a new frame. Recorded observations are
excluded from screen calibration and target collection; live camera calibration
continues to use labeled screen targets and independently measured head pose.
Interactive replay processes the latest available frame with one inference in
flight; the exhaustive evaluation used sequential decoding, not real-time replay.

No new runtime dependencies or vision model downloads were added. IR disables
unused face blendshape output, retains two-face rejection and head matrices, and
keeps heavy models lazy. Small-eye filtering is bounded, and processing stays off
the UI thread. Production Nginx configuration now enables gzip for scripts, WASM
and binary model assets using [the standard gzip module](https://nginx.org/en/docs/http/ngx_http_gzip_module.html).
The cold IR vision assets measured approximately 26.83 MB raw / 10.50 MB gzip;
this is an asset-size measurement, not a verified deployed transfer. Nginx was
not installed locally, so deployed `Content-Encoding` still needs checking.
OpenCV currently reserves a 128 MiB WASM heap. This build is therefore not a
minimal-memory universal-phone implementation; real iOS/Android startup, sustained
throughput and memory measurements remain necessary.

Final verification: **296 Bun tests passed across 29 files**, zero failures;
full frontend lint and TypeScript/production build passed. Independent code review
found and verified fixes for repeated scrubbing intent, paused settings refresh
and the uneven-illumination rejection. No new concrete regressions remained in
the final review.
The actual production build replayed a private 3 s excerpt, displayed measured
pupils and head pose at approximately 28 processed fps, and cleared output at end.
The original development route remains available on port 4003.

## Coverage and accuracy follow-up (2026-10-02)

This follow-up supersedes the 479/865 binocular counts above. Both entire private
reference recordings were processed again through the real browser pipeline,
sequentially at all 2,417 source-frame timestamps. No interpolated, held or
landmark-generated pupil positions are counted as detections.

Recovery now removes local illumination at two spatial scales on the small native
pixel eye crops. It suppresses compact positive outliers before normalization and
masks outside the current lid opening so lashes cannot merge with pupil contours.
Each transform keeps independent head-remapped shape/intensity histories; current
native evidence remains first. Broader normalization preserves pupil interiors;
finer normalization can recover their rims. The global contrast transform remains
an additional fallback. No new model or runtime dependency was added.

Every transformed recovery requires a distributed rim in the original camera
pixels. Subpixel, averaged radial samples are corrected using robust background
slope estimates. A median second-difference noise estimate raises the minimum
contrast on noisy input. Partial fits also need at least 16 supported directions;
current raw evidence must support their center even when prior shape is reused.
Dark-rim evidence excludes candidate-local specular pixels. Reflection rejection
uses the candidate's raw intensity rather than an unrelated whole-crop peak, which
previously let a brighter distant highlight hide broad local glare. Independently
measured enclosing-iris support is also checked in raw pixels before bright-pupil
acquisition, avoiding artificial normalization halos.

Valid MediaPipe iris geometry now supplies a **search prior only**: it restricts
pupil center travel and maximum size before candidate ranking. Canthi/lids still
supply independent head coordinates, and gaze still uses the measured pupil
center. Missing, off-aperture, implausibly sized, collapsed, one-sided or collinear
iris predictions fall back to the original eye-opening search. The prior tolerates
iris-model size error and does not require hidden iris-ring points to lie inside
partially closed lids.

| Recording | Frames | Both pupils, previous → current | Any pupil current | Face frames | Median processing | p95 processing |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Off-axis lighting (`01-53-37`) | 1,217 | 479 → 1,031 (84.7%) | 1,194 | 1,213 | 49.5 ms | 60.0 ms |
| Light directed at eyes (`01-55-24`) | 1,200 | 865 → 1,044 (87.0%) | 1,166 | 1,200 | 39.7 ms | 66.6 ms |

Visual/source-pixel review identified a false corner measurement at clip 2,
frame 605: its center changed from approximately (657.9,489.4) to (628.7,474.3)
after anatomical constraints. The suspect eye-0 fit at frame 451 is now absent.
These are reviewed examples of placement/rejection improvements, not independently
labeled pixel-error measurements. Remaining ambiguous rims, blur and glare can
still cause incorrect fits; every visibly open eye has not been established as a
correct pupil detection. Neither these counts nor agreement with an iris prior
establish calibrated screen-gaze accuracy.

An independent synthetic sweep checked 320 cold acquisition/disappearance cases
across four random seeds, five lighting directions, two noise levels and multiple
glare sizes: no false acquisitions or post-disappearance measurements remained.
All 1,280 genuine acquired pupil frames in that sweep were detected, with maximum
center error 1.164 source pixels. These controlled synthetic results do **not**
represent accuracy on the videos or on other cameras/subjects.

Processing timings are from the complete automated browser evaluation on this
machine, with verification work also running during portions of it. They exceed
33.3 ms in many frames, so this does not establish sustained 30-fps inference or
universal mobile performance. Live replay continues to process the latest frame
with one inference in flight; exhaustive offline counts should not be interpreted
as real-time throughput. The existing device/memory/transfer limitations above
remain applicable.

The final collinearity guard was added after video inference; every recorded iris
ring was checked and remained outside its rejection region (minimum normalized
cross product 0.958/0.988, threshold 0.2), so it changes no recorded-frame search
bounds. Regression tests separately cover its fallback behavior.

Concrete remaining inspection cases are clip 2 frame 869 eye 1 (reflection-cap/
partial-rim ambiguity) and clip 1 frame 330 eye 1 (upper-iris cap). Their blurred or
occluded rims do not support independent pixel-error labels; they remain examples
of uncertainty rather than evidence that the video tracker is universally accurate.

Final verification: **316 Bun tests passed across 29 files**, 0 failures and
2,501 assertions; frontend lint and TypeScript/production build passed. Independent
review verified noise/glare disappearance checks and the corner-fit correction.
The application stays available on port 4003; the private evaluation server and
benchmark page were removed after validation.
