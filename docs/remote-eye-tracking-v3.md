# Remote eye tracking V3

## Uncertainty, perimeter and rotation follow-up — 9 October 2026

Remote live gaze again shows the bounded uncertainty region, with a separate
10px center cursor. Recordings draw both at the same position and scale. The
region describes estimated error; it does not correct the mapping or guarantee
that a user's fixation lies inside it. Larger measured errors still show the
existing warning rather than being concealed by the display cap.

Screen and remote setup grids now use 4% and 96% positions instead of leaving
larger unmeasured borders. The sequence still has nine targets. Existing saved
models retain their original coefficients; accepted older near-eye grids can
still seed a head-only retry. The shared pill starts at a responsive 32×20px
(smaller on phones), shrinks to half size, and keeps its 3px focal point fixed.
Bottom-target guidance appears above the point to remain visible. Browser checks
caught and repaired implicit-grid centering and conflicting cancel-button
positioning; desktop and mobile focus centers now match their recorded labels.

Facial IR calibration can compare a new `binocular-camera-plane-v1` representation
with the existing candidates. It combines the measured canthus-normalized pupil
displacements in image axes with the face-forward vector composed using the
existing rotation convention and converted to image axes. Calibration learns
the ocular/head gains rather than adding native head roll to eye-local offsets.
This is a camera-plane regression input, not a reconstructed metric gaze ray.
Old representations and the pupil detector remain unchanged. Close-up IR without
face pose cannot use this bank. Existing spatial, temporal-block and per-axis
gaze-response checks must pass before it can replace a mapping. No additional
detector, image readback or user hold was added.

The latest supplied webcam export (2) contains a base-point model with no accepted
head correction. Its target-balanced gaze response spans about 90% horizontally
and 92% vertically; independent raw check RMS is 156.9px in the recorded 1512×738
viewport. Every available motion candidate worsens the final held-out motion
block, so replay keeps the existing model. This explains why that recording
does not demonstrate accepted head compensation; no guard was relaxed to make
it appear successful. The new IR bank does not change webcam/mobile arithmetic.
Private observations remain outside the repository.

Independent fixtures exercise combined rotations at peripheral targets for both
the new IR representation and the existing near-eye ray/plane projection. They
check the implementation, not human tracking accuracy or equivalence to market
hardware. Near-eye projection arithmetic is preserved. Measured camera geometry,
physical wearer motion, lighting and independent real-device checks are still
needed to qualify rotation and distance accuracy.

Verification: 1,057 frontend tests pass, with typecheck, lint, production build
and formatting checks passing. Fresh read-only review found no material defect
and passed 106 focused tests. Desktop/mobile browser checks verify the restored
bubble, fixed focal center during shrink, all nine perimeter labels, and clear
cancel/guidance placement. Changes remain uncommitted on the current v3 branch.

## Gain and head-motion regression audit — 9 October 2026

The supplied webcam export contained 162 gaze-grid readings, 98 valid center
head-hold readings and 92 independent accuracy-check readings. Grid yaw/pitch
spanned only 0.014/0.018 radians, while the head hold spanned 1.072/0.698 radians.
The selected 29-feature spatial model normalized tiny calibration variation
into large slopes. Its additive head correction was rejected, leaving a live
Y estimate of 2.745. This was a readout-training problem, not a cursor clipping
or missing-face problem.

The motion phase now fits the readout itself from the known gaze grid plus its
fixed-center head hold. Webcam/mobile candidates use the existing latent
appearance/ocular/head representation or original feature bank; IR candidates
use measured binocular/head features or their original bank. No new model,
camera readback, weights, live pseudo-labels or calibration dots are introduced.
The measured iris detector is unchanged by this repair.

Selection uses nine whole-location spatial folds and four contiguous motion
folds. The held-out center spatial fold excludes the entire center head hold.
Spatial RMS must stay within the existing fit guard, every motion block must
avoid meaningful regression versus the previous mapping, and aggregate motion
RMS must improve by at least 25% and remain within the same normalized error
limit. Each fitted screen axis must retain at least 90% response to the labeled
gaze grid; unrelated ocular noise cannot qualify by suppressing gaze movement.
Within one estimated standard error of the
minimum joint loss, stronger ridge regularization is preferred. These are model
selection checks, not independent physical accuracy verification.

Strict `joint-motion-v1` profile metadata accompanies the coefficients. An
unhelpful retry preserves the previous fit and accuracy check. Source feature
version remains the camera's version even when the readout uses 26 appearance
values; unversioned 29-value camera observations stay compatible. Calibration
pose coverage and accuracy-checked pose coverage remain distinct. Moving beyond
checked coverage changes the accuracy status without hiding gaze.

Independent review found and reproduced two edge cases before completion:
anisotropic appearance noise could contract one gaze axis, and a legacy additive
retry could erase previously learned motion axes or invalidate validation after
an identical hold. Failing regressions were added first. The fitted-axis response
guard rejects the contraction, the shared hold validator preserves learned axes,
and additive retry scores now compare against the currently compensated output.
The same axis-preservation guard applies to joint-model retries.

Private-export replay (1512 × 738 viewport):

| Readings | Previous RMS | Joint-fit RMS | Used for fitting? |
| --- | ---: | ---: | --- |
| Nine gaze holds | 31.1 px | 69.3 px | Yes |
| Center motion hold | 2558.1 px | 129.4 px | Yes |
| Separate accuracy check | 274.0 px | 77.1 px | No |

The selected model was the appearance representation with ridge penalty 1.
The motion-hold out-of-screen count fell from 81/98 to 0/98; the independent
check fell from 51/92 to 13/92. Remaining out-of-screen coordinates are retained,
not clamped. Training-grid fit became worse while generalization improved;
training error must not be presented as accuracy. The center temporal held-out
RMS was 0.231 normalized screen distance, so this does not establish precise
compensation at every unseen pose, distance, person or lighting condition.
Private observations remain outside the repository.

At this earlier repair, remote live gaze used a 10px filled cursor without the
uncertainty ring. The follow-up above restores the requested region alongside
that cursor. Filtering, raw coordinates, verification state and edge warnings
remain unchanged.

**Current default, 9 October 2026:** the newer remote calibration remains active:
nine full-screen targets, an optional center motion hold, compatible saved profiles,
adaptive display smoothing and single-face MediaPipe processing. `origin/v3` is
an accuracy/stability benchmark, not the implementation to restore. The previous
baseline recovery was a misinterpretation and has been superseded. The
[forward stability review](head-compensation-research.md#forward-stability--2026-10-09)
records the bounded improvement and measurement limits. Neither synthetic tests
nor the older recording establish current wearer accuracy.

For UI rules, current behavior, and branch integration checks, read
[the V3 integration handoff](remote-eye-tracking-v3-handoff.md).

The public `/trial/remote-eye-tracking` route offers **Mobile eye tracker**,
**Webcam-based eye tracker**, and **IR webcam-based eye tracker**. `/trials` aliases
the existing `/trial` page and links to this flow. The isolated implementation
lives on `codex/v3-webcam-gaze`; the existing near-eye tracker remains available.

## Run locally

```sh
cd /path/to/gaze-core/frontend
bun install --frozen-lockfile
bun run dev --host 0.0.0.0 --port 4003
```

On the computer, open `http://localhost:4003/trial/remote-eye-tracking`.
A phone requires **trusted HTTPS**; `http://<computer-LAN-IP>:4003` is not a secure
camera origin. Use an existing HTTPS deployment or supply a certificate trusted
by the phone and matching the computer's hostname/IP:

```sh
GAZE_DEV_TLS_CERT=/absolute/path/to/certificate.pem \
GAZE_DEV_TLS_KEY=/absolute/path/to/private-key.pem \
bun run dev --host 0.0.0.0 --port 4003
```

Open `https://<certificate-hostname>:4003/trial/remote-eye-tracking` on the same
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

The live marker uses the [shared gaze bubble](eye-tracking-v2.md#compact-live-gaze-bubble), with a maximum diameter of 300 CSS pixels or half of the shorter viewport dimension, whichever is smaller. This applies to mobile, webcam and IR modes. Current validation's P95 pixel error informs its radius; an X/Y offset change makes the previous check inapplicable until validation is repeated. Error beyond the size limit produces an amber warning. Stabilization is display-only: raw synchronized samples, validation and exported model data are unchanged.

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

To inspect a recording, open `/trial/remote-eye-tracking`, select IR, and use the
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
the UI thread. The current app uses Next.js standalone hosting; configure
model/WASM compression at your deployment proxy when needed.
The cold IR vision assets measured approximately 26.83 MB raw / 10.50 MB gzip;
this is a historical asset-size measurement, not a verified deployed transfer.
Deployed `Content-Encoding` still needs checking.
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

## Webcam/mobile stability experiments — 8 October 2026

Reported baseline: Redmi Note 8 approximately 2–3 processed FPS and Poco F6
approximately 5–7 FPS while face/head tracking runs. These changes are local,
uncommitted experiments on `v3`. No phone measurements have yet established an
improvement in FPS or absolute gaze accuracy.

The RGB worker now reads only the bounded source region needed by the existing
512×128 eye strip. Original source resolution, landmark coordinates, padding,
inverse projective transform, and nearest-neighbor sampling remain unchanged.
Regression fixtures compare every output byte with the previous sampler at four
resolutions and across clipped borders. Sampling avoids allocating a coordinate
array for each of the 65,536 output pixels. Geometry reuses one rotation transpose
per frame.

Startup measures warmed, completed appearance inference on WASM and float32
WebGL using two synthetic inputs. A backend needs at least a 15% measured speed
advantage to replace the preferred backend; predictions must agree within 0.005
normalized Euclidean distance. This is a numerical sanity check, not an accuracy
validation. A checked alternative can recover if the selected backend becomes
unavailable. CPU remains a fallback. Selection finishes before calibration and
never changes in the middle of a session. Model weights migrate to the selected
backend before unused backend pools are released. Asynchronous output reads and
tensor disposal remain in place.

The mobile/webcam gaze display opts into a speed-adaptive One Euro filter using
actual source timestamps. It has no fixation lock or prediction of missing
measurements. Unlike the old 150 ms reset limit, it retains filter history during
2–5 FPS delivery. Both display expiry and gap reset are capped at one second from
the original source time. Lost eyes, invalid values, calibration/offset changes,
and viewport changes clear history. IR, screen, and scene retain their existing
display behavior. Raw calibration, validation errors, and click correction inputs
remain unsmoothed; display filtering cannot hide or correct systematic bias.

The calibration loop skips React updates when sample progress and guidance are
unchanged, while continuing to check every animation frame. Tap/click the existing
FPS readout for backend, capture, face, pixel-readback, preprocessing, appearance,
and total source-to-result timings. FPS counts completed source frames, including
invalid eye observations; it does not count display animation frames.

Synthetic checks, not phone or human gaze measurements:

| Check | Before | After |
| --- | ---: | ---: |
| 1280×720 preprocessing median | 2.57 ms | 1.02 ms |
| 1280×720 preprocessing p95 | 3.17 ms | 1.33 ms |
| Fixation RMS at 5 FPS | 11.72 CSS px | 6.95 CSS px |
| Fixation RMS at 2 FPS | 10.40 CSS px | 7.27 CSS px |

Preprocessing timings use 75 warmups and 300 iterations with simulated array
readback, strip sampling, and geometry. They exclude browser/GPU readback, face
detection, and neural inference. The neutral crop reads 8.73% of full-frame pixels.
Filter traces use seeded zero-mean fixation noise with a 1200×800 CSS viewport.
Large jumps respond on the first new sample; tests also cover pursuit, slow drift,
uneven sampling, duplicates, and source expiry. Three updates at 2 FPS still take
1.5 seconds: smoothing cannot remove camera/inference latency or recover saccades
that were never sampled.

Research used for these decisions:

- [Casiez, Roussel and Vogel, CHI 2012 — One Euro filter](https://gery.casiez.net/1euro/): speed-dependent cutoff and the jitter/lag tradeoff. Constants here are experimental, not universal gaze parameters.
- [Feit et al., CHI 2017 — Toward Everyday Gaze Input](https://www.microsoft.com/en-us/research/wp-content/uploads/2017/01/everyday_eyetracking.pdf): measure precision and absolute error separately; filtering must be evaluated against delay. Their hardware/sample rates do not establish performance on these phones.
- [Blignaut, JEMR 2019 — adaptive gaze filtering](https://bop.unibe.ch/JEMR/article/download/JEMR_12.2.3/7837): filter windows and latency depend on sampling conditions; its high-rate evaluation cannot be copied to 2 FPS.
- [Andersson et al., JEMR 2010 — Sampling frequency and eye-tracking measures](https://bop.unibe.ch/JEMR/article/view/2300): low sampling rates limit temporal measurements.
- [TensorFlow.js platform guidance](https://www.tensorflow.org/js/guide/platform_environment): backend/device differences, float32 capability, warmup, asynchronous reads, and explicit memory management.
- [MediaPipe Face Landmarker web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js): synchronous detection belongs off the UI thread. The current worker and multi-face rejection remain intact.

Next device check: use the same camera, browser, lighting, and distance on both
phones; note FPS plus the expanded stage timings after warmup. Check center
fixation, rapid target switches, slow pursuit, blinks/reacquisition, and held-out
validation. Report raw error alongside perceived steadiness. This will show
whether face detection or appearance inference needs the next optimization.

Verification with the configured Bun 1.4.2 runtime: 807 frontend tests passed
across 86 files, including the actual bundled appearance model. Frontend lint,
TypeScript checks, and the Next production build passed. Independent review found
no remaining blocking issue after backend-pool cleanup. Redacted Gitleaks scanning
of all changed source files found no secrets. No dependencies, model weights,
backend/auth code, branch state, or commits changed.


## Current calibration flow — 2026-10-08 estimator repair

All three remote camera modes share one nine-dot setup covering the center, corners and edge midpoints. RGB calibration compares the compact affine/quadratic neural correction with the existing binocular feature mapping; IR retains its feature-based mapping. The optional head-compensation stage uses a single center fixation with comfortable movement to learn measured pose-dependent error. It does not repeat the screen grid or treat motion training as an independent accuracy pass.

After fitting, the current flow automatically continues into a separate five-dot accuracy check. Poor or missing measurements remain visible as unverified results. Valid head movement outside captured coverage no longer hides gaze, but checked status does not extend beyond independently checked poses. Invalid/lost eye evidence still pauses output. Full validation and numerical regression details are recorded in `head-compensation-research.md`, under the evening estimator repair. Physical-camera accuracy is still unmeasured; use a fresh calibration to try the new coefficients.

### Shared screen sequence and shorter setup — 2026-10-10

Near-eye screen, remote webcam, mobile and remote IR calibration now share the
same target definitions and coarse capture guide: center, top-left, top-right,
bottom-middle, bottom-left, top-middle, bottom-right, left-middle, right-middle.
Edges remain at a 4% inset. The shared pill starts larger, shrinks
around its fixed focal center as accepted collection advances, rotates only
with progress and pops before the next target.

The center hold is a cooperative baseline. Later holds use source-specific eye
signal orientation, robust center noise and accepted edge displacements. A
middle axis stays within 85% of its learned center-to-edge range. Directed
movement needs 15% of the learned range, subject to the existing noise floor.
An unmeasured direction uses its own noise floor rather than inheriting the
opposite direction's gain; upward and downward responses need not be symmetric.
These relaxed tolerances allow moderate off-axis gaze at side dots and reject
obvious wrong sectors; it cannot prove exact attention before a personal mapping
exists. Remote ordinary holds also require stable eye and head readings. Missing
or unstable readings reset only the incomplete hold. Intentional head-motion
training and independent accuracy measurement bypass those capture conditions;
bad accuracy readings remain part of the result rather than being filtered out.

Remote capture prefers the already measured binocular camera offsets for coarse
direction and fixation stability. Both named eye vectors must use the camera
coordinate convention; IR vectors must come from measured pupils. Neural hints
remain a fallback when measured offsets are unavailable. Once the center source
is chosen, a hold cannot silently switch sources or mix their baselines. This
guide only accepts capture frames; it does not constrain live predictions or
rewrite saved profiles.

Results exports now include a bounded live trace: up to 200 observations from
the last 20 seconds, sampled at most ten times per second outside capture.
Each entry contains the source features, mapped output and aligned/offset
screen coordinates before display smoothing. Missing readings and out-of-screen
coordinates remain explicit. The trace is kept in memory, resets with its
mapping/coordinate context, contains no video frames and is included only in
the existing user-triggered download. This distinguishes live estimation errors
from display geometry without another calibration. It is not accuracy evidence.

Camera connection opens Calibration directly, with IR settings on that card.
Local video inspection remains available but cannot calibrate screen gaze.
Clickable steps preserve the camera/model between Camera, Calibration, Check
accuracy and Results. Choose leaves the tracker and stops its camera, as the
existing back-to-choices action did. After new calibration, both screen routes
start independent accuracy dots automatically. Canceling that check retains the
fitted model.

Compatible saved personal profiles load directly into Results without a required
human recheck. Camera, feature, viewport and payload compatibility checks remain.
Stored offsets and session alignment are restored; this session's accuracy is
unverified until an optional check is performed. Physical scene marker/hand
calibration retains its detector geometry and separate coordinate space.

## Remote gaze range repair — 2026-10-09

Reported symptom: webcam/mobile/IR gaze stays inside a small box even with a still
head. The display filter has no central position boundary. A controlled RGB
fixture reproduced another cause: a weak neural eye response mixed with
target-unrelated appearance drift produces a finite mapping that predicts nearly
50% for every gaze direction. The previous RGB flow always chose that mapping,
ignoring the binocular iris measurements already present in the feature bank.

The neural fit now checks whole-target held-out fixation centers against the
existing normalized spatial-fit support limit (0.24). This checks whether the
captured locations form a predictive mapping, not whether a calibration is
independently accurate. Isolated raw-frame spikes do not cause this rejection.

For the current 29-column RGB bank, calibration also evaluates the existing
regularized feature fitter. It uses that mapping when the neural fit is
degenerate, or when target-balanced held-out frame RMS improves by at least 20%.
Otherwise it retains the compact neural mapping. Both candidates now report RMS
in the same normalized screen units. Feature regularization selection and its
existing mean-error support gate remain unchanged. The selected mapping stays
fixed during live tracking; no range stretching or new display clamp is added.

Fallback fitting uses only supported neural-version readings. Its saved model
retains that neural dependency; prediction and strict profile validation reject
incompatible network versions. Missing holds and source-version failures keep
their existing recovery behavior. IR retains its existing fitter; regression
fixtures cover both legacy and camera-axis inputs at unseen screen edges.

Ten numerical regressions cover weak and constant neural estimates, usable
binocular motion with fixation noise, reliable compressed neural coordinates,
unresponsive inputs, IR screen range, serialized model validation, and mixed
network versions. These verify software behavior, not physical camera accuracy.
Existing saved coefficients are not rewritten. A fresh calibration is needed to
evaluate source selection on the user's camera; no additional targets are added.

Verification: the isolated frontend suite passed 942 tests across 99 files
(11,186 assertions). A preceding run alongside the production build hit five-second
remote-flow test timeouts and subsequent DOM cleanup failures, plus the
time-sensitive scene marker expiry check. The complete isolated rerun passed all
of those checks. No unrelated production logic was changed to suppress the failures.
Independent review found no remaining blocking issue after the live, profile, and
training neural-version guards were added. Changes remain uncommitted on `v3`.
Frontend TypeScript checks, lint, the production build, and `git diff --check`
also passed after the final implementation change.

### Camera export and served-code check — 2026-10-09

The subsequent recording and local results export identified the cause of that
session's restricted range. Its calibration stores normalized affine coefficients,
but the development server's generated browser module still called the older
raw-coordinate affine predictor. Applying those coefficients directly to raw
neural coordinates reproduced all five recorded validation biases exactly. The
earlier weak-response fixture was a separate software regression, not the cause
demonstrated by this camera session.

The current source already uses `predictBasePointSpatial` for fitting and live
prediction, including the saved mean and scale. Invalidating the stale development
module regenerated the correct browser predictor. The actual HTTP-served browser
module was then executed locally against the unchanged exported model and all
91 independent check readings. Mean error changed from 433 px in the stale
result to approximately 130 px in replay; the check centers again reached both
left and right sides. Source replay measured 226 px P95 error. These readings
still contain substantial vertical bias and are not a claim of verified camera
accuracy, head compensation, or a new live measurement.

The 24 existing spatial, range, and adaptive-flow regressions passed. No additional
estimator or pupil-processing change was needed for this diagnosis. Generated
development files and the user's biometric export are not committed. A browser
tab must receive the rebuilt module before testing; old validation statistics
remain old measurements until another accuracy check is run. Save an active
profile before a full page reload if its calibration needs to be retained.

### Face and binocular vector diagnostics — 2026-10-09

The camera card now displays face direction and separate anatomical left/right
eye movement, controlled by the axes icon. The face direction is the native
rotation's forward unit vector, converted once to image axes (X right, Y down,
Z toward the camera). Eye arrows are measured iris displacement for RGB or
measured pupil displacement for IR, relative to each canthus midpoint and
normalized by eye width. Arrows are magnified four times for visibility; numeric
values are unchanged. They are 2D movement signals, not inferred 3D visual rays.
Mirroring transforms the preview and arrows together, never the measurements.
Missing IR pupils keep their anatomical slots; close-up IR has no bilateral face
vectors. Current vectors and timestamps are included in local result exports.

The readout compares calibrated screen estimates before/after the optional
learned head residual. It excludes return alignment and manual offsets; the
underlying estimator may already include head inputs. This comparison measures
an applied correction, not accuracy.

Two reproduced IR defects were corrected. Changing only the eye-axis setting
now reaches the worker and invalidates paused replay. The camera-axis feature
bank now uses each eye's actual image displacement, instead of rotating its
local offsets by native metric head roll. Metric-space Y is opposite image Y;
canthus image angle also need not equal rigid head roll under perspective.
The changed bank is versioned `ir-camera-axes-v2`. Existing v1 profiles remain
stored but cannot silently load against v2 measurements. The legacy default
bank and RGB mapping are preserved. The corrected optional IR setting needs a
matching calibration.

The metric/image conversion follows MediaPipe's
[geometry pipeline](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_geometry/libs/geometry_pipeline.cc).
[MediaPipe Iris](https://research.google/blog/mediapipe-iris-real-time-iris-tracking-depth-estimation/)
does not by itself estimate gaze direction. These diagnostics and IR corrections
do not qualify the inactive 3D prototype or establish physical head-motion
accuracy for webcam/mobile. No detector pass, camera permission, external upload,
or new persistence path was added.

Verification: the complete frontend suite passed 1,022 tests (51,201 assertions).
TypeScript, lint, production build and whitespace checks passed. Independent
review passed 61 focused tests and found no material defect in this scope.
Desktop (1440 px) and mobile (390 px) browser checks used a synthetic camera feed,
displayed all three vectors, exercised the toggle, and checked body/tooltip bounds
without runtime errors. Screenshot inspection identified and corrected mobile
tooltip clipping. Final presentation regressions passed, and HTTP checks confirmed
the running app serves the new controls, export fields, RGB vector builder and
IR v2 processor. These checks establish software behavior, not wearer accuracy.
Changes remain uncommitted on the existing `v3` branch.

## Appearance personalization and reference audit — 2026-10-09

The webcam/mobile processor now exposes the existing BlazeGaze `dense_1` representation (16 head-conditioned appearance values) alongside its unchanged two-coordinate output. It runs the existing encoder once and reads one 18-value tensor. The original model owns all weights; the auxiliary readout borrows layers. Actual-weight tests check numerical parity, repeatability, tensor lifetime and disposal. No model download or second detector was added.

Calibration can fit those 16 values together with four binocular image offsets and six head variables. This preserves information lost when personalizing only the generic two-coordinate prediction. An independently derived head-plane normalization removes projected yaw/pitch shear from the ocular offsets after canthus-based roll normalization. Facial IR gets a compact candidate using its measured pupils and the same normalization, without requiring RGB appearance inference. These are learned screen mappings, not metric 3D gaze estimators.

The existing mapping remains available. A candidate must improve target-balanced, whole-target-held-out RMS by at least 20% and pass per-target error and jitter checks on the same frames. Missing embeddings cannot improve a score by removing difficult readings. No live estimator switching, cursor-derived labels, additional calibration targets or automatic retry rounds were introduced. Existing profiles keep their old representation; new profiles store the input kind and representation version. A new ordinary calibration is necessary to fit the appearance representation because older captures do not contain it; old profiles remain usable.

### What the supplied references actually support

- [EyeMU paper](https://chrisharrison.net/projects/eyemu/EyeMU.pdf) and [reference transfer code](https://github.com/FIGLAB/EyeMU/blob/master/flask2/static/transfer.js): frozen CNN features plus a compact regressor are useful for personalization. The reported evaluation includes device-level training and temporal averaging; it does not prove short per-person calibration accuracy. Our readout uses existing BlazeGaze weights and an independent implementation. No EyeMU GPL code or GazeCapture weights were imported. The existing asset qualifications in `research/WebEyeTrack-NOTICE.md` still apply.
- [EyeTrax extraction](https://github.com/ck-zhang/EyeTrax/blob/master/src/eyetrax/gaze.py): center, rotate and scale facial landmarks before fitting a personalized regressor. Removing head-relative variation does not remove the need to retain camera-relative pose/position. Its adaptive routine is not a shortcut: it can add many points. We kept our existing full-screen sequence.
- [JEO's webcam prototype](https://github.com/JEOresearch/EyeTracker/blob/main/Webcam3DTracker/MonitorTracking.py): stores a head-attached approximate eye center and draws iris-to-center rays. It assumes eye radius and screen geometry. Its legacy [FaceMesh attention graph](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_landmark/tensors_to_face_landmarks_with_attention.pbtxt) assigns iris depth using surrounding eyelid depth. Copying that construction would not establish accurate physical gaze. The existing preview therefore continues to distinguish measured eye movement from a calibrated 3D ray.
- [HiFiGaze paper](https://arxiv.org/html/2603.19588v1): screen-reflection segmentation adds useful signals when high-resolution eye reflections and known screen content are available. Its measurement/refinement workload and capture assumptions are different from ordinary low-resolution mobile/webcam frames. We did not add an expensive segmentation pipeline to phones already constrained by inference cost.
- [RGBDGaze paper](https://rikky0611.github.io/resource/paper/rgbdgaze_icmi2022_paper.pdf) and [fusion model](https://github.com/FIGLAB/RGBDGaze/blob/master/GazeEstimation/models/two_stream.py): RGB and synchronized measured depth are separate inputs. A grayscale IR stream or MediaPipe relative landmark depth is not a substitute for its depth channel.
- [Tobii webcam product description](https://www.tobii.com/products/eye-trackers/screen-based/webcam-eye-tracking): appearance-based webcam tracking is offered with guided setup and quality checks and is positioned for areas of interest. It does not provide an open model that can establish equivalent performance here.

### Evidence and remaining limits

Synthetic tests now cover new target/head-pose combinations, perimeter targets, IR projected ocular/head separation, invalid/missing representation rejection, a noisy candidate losing to the baseline, per-corner/jitter selection guards, and profile round trips. These verify implementation contracts; they are not measurements of human gaze accuracy. The prior private camera export has no appearance embeddings, so it cannot validate the new representation's real-user accuracy.

The optional center head hold still fits an additive pose residual. A center fixation cannot identify a gaze-dependent change in peripheral gain: a multiplicative error can be zero at the center. No physical camera-to-screen registration, per-eye metric rays, depth sensor, or guaranteed return-session accuracy was invented by this change. Saved profiles and short return alignment remain available, but camera placement/lighting/person changes may still require adjustment. A wearable fixation recording with separate corner, head-motion and distance checks is required before a production accuracy claim.

Verification for this implementation: 1,030 frontend tests pass (51,779 assertions across 111 files); typecheck, lint and production build pass. Chrome exercised the actual detector/model worker with a generated local feed at desktop and narrow layouts: finite 16-value appearance features, all three vector overlays, no page errors or horizontal overflow. Approximately 30ms post-startup processing on the development Mac does not measure Android FPS. Independent code review found no actionable correctness defects; its requested held-out-pose and IR-selection coverage was added.

## Bounded iris refinement — 2026-10-09

[HiFiGaze section 3.2](https://arxiv.org/html/2603.19588v1) motivates refining an iris landmark using its visible image boundary. Its complete segmentation/reflection pipeline is not suitable for our current mobile processing budget. This implementation independently searches dark-to-light limbus edges inside the detected eyelid polygon, rejects inconsistent arcs, and fits a center using the landmark ellipse as a shape prior. It uses 40 rays, 21 radial positions and at most 80 deterministic consensus trials per eye. Low contrast, small irises, insufficient arcs and off-crop measurements decline refinement. Accepted corrections are bounded and confidence-weighted; there is no temporal averaging or additional model inference.

The processor reuses its existing eye-crop readback. Neither the pretrained image/pose inputs nor legacy calibration features change. A separate `rgb-iris-boundary-v1` observation carries refined offsets, with original offsets as its explicit fallback. Calibration may choose `appearance-refined` / `blazegaze-dense16-pixel-iris-v1` using the ordinary captured points. It must beat the currently selected mapping on held-out targets, preserve individual target error and stability, and retain acceptable behavior when either or both iris boundaries disappear. The same fold-trained model is tested on refined and fallback readings; the guard uses the worse state's error and the combined states' jitter. This prevents two individually steady estimates from concealing jumps between them. Existing profiles continue using their saved representation; no extra targets, retry sequence or live model switching is added. The IR pupil detector remains separate and unchanged by this follow-up.

Independent review found the between-state jitter gap in the initial fallback check. Its stationary synthetic regression failed before the correction and passes afterward. Image tests also cover displaced landmarks, subpixel motion, ellipse roll, noise, glints, partial eyelid coverage, straight-edge distractors and cropped coordinate consistency. Whole-suite verification: **1,040 tests pass, 52,139 assertions, 112 files**; typecheck, lint, production build and whitespace checks pass.

Chrome exercised the production worker at desktop and narrow layouts without page errors. The drawn face fixtures correctly took the uncertain-boundary fallback; its added work measured approximately 0.3–0.4ms per frame on the Mac. A separate accepted-boundary microbenchmark measured approximately 0.36ms median for two synthetic eyes in Bun. These timings are development-machine measurements, not Android benchmarks. Synthetic center recovery and held-out mapping tests do not establish human gaze accuracy. Real users, lighting, eye colors, spectacles, head motion and camera distances still need evaluation before an accuracy claim. No depth channel, metric 3D eye ray, extra sensor or externally sourced weights were added. Changes remain uncommitted.
