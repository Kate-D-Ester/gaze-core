# Tracking model choice

The viewer uses **SAM 2.1 Tiny** for continuous selected-region tracking. YOLOE remains the click-selection and acquisition proposal model. Selection stays in Scene; Target independently searches the original Scene reference, then owns a separate tracking state. This is visual tracking for the LED cosplay viewer; no hardware control is included.

## Why replace NanoTrack

The previous NanoTrack path required every moving crop to match the original pixels. Angle changes, partial occlusion and open/closed hand postures violate that assumption. Removing the check alone permits reference drift. The replacement uses a prompted segmentation model with temporal memory, keeps the original selection immutable for acquisition, and treats recovery as a separate operation.

[SAM 2](https://github.com/facebookresearch/sam2/tree/2b90b9f5ceec907a1c18123530e92e794ad901a4) supports prompted video segmentation and object memory. The service pins this source revision and its official 2.1 Tiny checkpoint, loads weights strictly, and adapts the streaming step without retaining a complete camera recording. Source/checkpoint licenses are recorded in [NOTICE](../vision/NOTICE.md).

## Local model comparison

Measurements below used the supplied local recording on an Apple M1 Pro with 16 GiB RAM. Initialized-tracker probes received an initial box directly; they do **not** validate Target acquisition or product recovery. A correct reviewed checkpoint means box IoU >=0.5; missing boxes fail.

| Candidate | Weight file | Observed fit |
| --- | --- | --- |
| NanoTrack v3 | 2,615,375 bytes across two ONNX files | Small and fast, but the original-crop policy failed the required pose tracking. Retained only as a regression baseline. |
| EdgeTAM | 56,116,523 bytes | Smaller checkpoint, but roughly 248 ms per frame in this local probe. Face/glasses errors and mask contamination survived high presence scores. |
| SAM 2.1 Tiny, 1024 | 156,008,466 bytes | Better face segmentation, but roughly 1.12 seconds per frame on this Mac. |
| SAM 2.1 Tiny, 512 mixed precision | Same checkpoint | About 100 ms per frame; passed all 49 sparse initialized-tracker checkpoints. Chosen for detail and throughput. |
| SAM 2.1 Tiny, 384 mixed precision | Same checkpoint | About 67 ms per frame; passed 47/49 checkpoints. Clothing extent lost detail, so this configuration was rejected. |

[EdgeTAM](https://github.com/facebookresearch/EdgeTAM) reports mobile-device benchmarks, which do not establish performance on this Mac. [SAM 3.1](https://github.com/facebookresearch/sam3/blob/main/RELEASE_SAM3p1.md) was not the first local candidate because its official setup targets CUDA GPUs. These fit assessments are engineering inferences and local measurements, not universal model rankings.

## Runtime and recovery

The selected configuration uses 512-pixel inference with MPS float16 autocast. CPU inference remains float32. Each camera retains its original conditioning frame and at most 16 recent accepted outputs. The shared neural model has no per-camera recording state. Sessions are limited to four selections and expire after ten minutes; Clear releases their camera memories.

Ordinary temporal updates use object presence and predicted mask quality. A weak positive overlap below 0.1 can continue only with presence >0.95, quality >=0.8, bounded extent and SAM token cosine >0.8 against the immediately preceding accepted mask. Zero overlap or abrupt extent change must be corroborated before replacing recent recovery evidence. Missing/uncertain predictions hide the overlay and cannot enter accepted object memory.

Brief recovery uses at most three recently verified views, each limited to 12 analyzed frames and two wall-clock seconds. Geometry must agree, and reliable optical motion or learned evidence must support the candidate. The SAM object-memory token uses cosine >0.8 with presence >0.95 and mask quality >=0.65. Otherwise [DINOv2](https://github.com/facebookresearch/dinov2) Small provides supplementary cosine >0.7 with quality >=0.8. Two consistent verified observations must occur within three analyzed frames and one second. A relocated candidate without overlap may now recover using SAM token cosine >0.8, presence >0.95 and quality >=0.8. Its area must stay within one-third to three times the trusted view, its pixel diagonal within one-half to twice that view, and center displacement within 1.5 trusted diagonals. Both relocated observations must also agree in motion and memory; descriptor similarity alone cannot authorize a jump. Valid uncertainty can occur between observations; true absence, malformed evidence and expiry clear confirmation. Long loss uses the immutable original reference for reacquisition.

Small selections receive an additional acquisition path when their shorter side is 12–63 pixels and longer side is below 160 pixels. A 24-pixel surrounding margin proposes a location only when normalized correlation exceeds 0.92 uniquely at the projected object scale. SAM must independently infer the selected object there from the original Scene conditioning, with presence >0.95, quality >=0.8, Source token cosine >0.7 and projected-box IoU >=0.5. Two Target observations within one second must agree with IoU >=0.5 and token cosine >0.8 before independently initializing Target memory. Ambiguous surroundings never suppress a uniquely verified original-object match. Surrounding context alone cannot produce a lock; stream changes, absence and expired confirmation reset the pending evidence.

Dense search retains native detail for tiny crops instead of reducing every frame to 480 pixels. This adds CPU work for small selections; large regions retain the reduced search. Tiny, blurred or visually indistinguishable objects can still remain Searching, especially across different physical viewpoints.

Different camera quality receives a separate, bounded acquisition fallback after ordinary geometric and dense search. A dense interior match must also pass full-crop verification before it can stop the search. [YOLOE visual prompts](https://docs.ultralytics.com/models/yoloe/) supply proposals, not instance identity; when severe Scene blur produces no visual proposals, the existing prompt-free detector supplies candidates for the same verification path. [DINOv2 descriptors](https://github.com/facebookresearch/dinov2/blob/main/MODEL_CARD.md) provide supplementary retrieval evidence. Changing the detector alone did not fix the supplied blurred-versus-sharp camera pair.

The fallback requires actual blur disparity or exposure change. It compares candidates at a common 32×64 portrait or 64×32 landscape resolution with fixed blur and percentile-normalized luminance. Raw body hue is checked separately, so removing saturation from the learned descriptor cannot make a recoloured object acceptable. Aspect ratio stays within two-thirds to 1.5 times the original; near-uniform patches are rejected. Coarse normalized correlation must exceed 0.92 under bounded ±10% crop alignment. Learned descriptors use the fixed canonical views, without optimizing the neural score over alignment variants.

An independently box-prompted Target SAM mask must have presence >0.95, quality >=0.8, proposal overlap >=0.5 and original Scene token cosine >0.7, matching the context acquisition corroboration floor. The verified mask crop must also pass the colour/coarse checks and normalized DINO cosine >0.7. Exactly one verified candidate is required. At most 20 raw proposals receive cheap colour/coarse filtering; more than five plausible candidates remain Ambiguous. Every plausible candidate must be verified before accepting a winner. Generic proposals cannot bypass these checks through a geometric match on a truncated candidate list. Two Target observations within one second must agree at IoU >=0.5 and token cosine >0.8. The second verified prediction initializes Target memory directly, avoiding redundant inference. Original Scene pixels and conditioning remain immutable.

Ordinary ambiguity is never overridden by a detector proposal: omitting a competing object does not prove that it is absent. Missing masks allow later proposals to be checked; malformed evidence, budget exhaustion and inference errors discard confirmation. A new Target lock or stream generation resets both acquisition state machines. Source tracking retains its existing mask model and immutable reference; ordinary matching thresholds are unchanged. Geometric proposal matching examines the complete bounded candidate list rather than accepting a winner from its first five entries. The 250 ms search deadline is a soft scheduling budget: no later candidate starts after expiry, but an already-started mask/descriptor verification can finish afterward. The browser separately rejects results more than 500 ms after their captured frame.

These are distinct algorithm scores: object presence, predicted mask quality, memory-token similarity, descriptor similarity and geometric inlier ratio are **not calibrated identity probabilities**. The Tracking overlay deliberately does not display an identity percentage. Similar-looking objects, long disappearance, rapid motion and substantial new viewpoints remain limitations.

## Replay method

Each case runs independently from its selection time through the recording's final real frame. By default Scene and Target receive identical video pixels, but Target receives only the Scene token and independently acquires its box. The evaluator also supports a mildly transformed copy. Neither mode measures independent physical-camera accuracy.

Private video, annotations, per-frame JSON, checkpoint sheets and annotated clips stay under ignored `.local-reference`. Hand truth annotations stop at 20 seconds and phone annotations at 30 seconds; later status logs continue through the endpoint without a ground-truth accuracy claim. Model scores and the fraction of frames displaying boxes are not tracking accuracy.

## Paired product replay and acceptance

| Case | Scene checkpoints | Target checkpoints | Median pair ms |
| --- | --- | --- | --- |
| face | 13/14 | 13/14 | 215 |
| glasses | 11/12 | 11/12 | 215 |
| clothing | 8/8 | 8/8 | 213 |
| hand-open | 7/7 | 7/7 | 213 |
| hand-closed | 4/4 | 4/4 | 296 |
| phone | 4/4 | 4/4 | 209 |

The complete current pipeline passed 47/49 sparse checkpoints in each view at 5 analyzed frames per second, across 671 frame pairs through the final real frame. Each Target independently acquired the selected instance. Failed checkpoints were absent overlays for face at 18s and glasses at 26s, rather than accepted wrong boxes. This is a substantial improvement over the original-reference NanoTrack path, which passed 13/49 Scene and 14/49 Target checkpoints on the same cases at a different analysis cadence. These local comparisons do not establish a general accuracy percentage or physical-camera matching performance.

Tracking still has brief gaps. Both hand cases lose the changed/occluded hand after about 22s and stay Searching through the endpoint; hand truth annotations stop at 20s. The phone's fast movement at 29.4s now enters Searching briefly and reacquires at 29.6s; its 30s checkpoint passes. It becomes absent/occluded again at 31.6s and remains Searching through the endpoint. Sparse annotations cannot rule out errors between checkpoints. Typical paired analysis takes about 209–296 ms on this M1 Pro, with per-case p95 values up to 365 ms; this is not a 30 fps live inference claim.

The final real-model acceptance checks passed same-category distractor disappearance, original return, independent Target reset, four interleaved tokens/eight camera states and memory release on Clear/expiry. Four selections used about 419 MB of allocated MPS memory in that fixture; Clear released all eight tracker states and returned allocation to about 276 MB. The public angle smoke check passed 0/5/15 degrees and healthy Scene/nonmatching Target pairs without Scene deactivation. The final Python suite passed 129 tests and focused viewer/tooling tests passed 71.


## Different-camera fixture and regression

The supplied Scene image was rotated 90° clockwise using the existing viewer orientation transform, then the 32×73-pixel blue screwdriver case was selected in Scene. Target received no box or location hint. All 1080 decoded frames of the separate 848×478 recording were analyzed through its final timestamp 35.713s, using actual variable-frame-rate presentation times.

Target independently acquired at 0.756s and remained matched on all 1060 subsequent frame results. All 17 hand-labeled tracking checkpoints from 2s through 34s passed IoU>=0.5. The opening 0.13s checkpoint remained unconfirmed during acquisition. Raw frames and overlay checkpoints were reviewed separately. Median Target analysis was 107 ms, p95 114 ms; this is not 30 fps inference or per-frame ground-truth accuracy. Substantial camera panning near the end remained tracked.

Removed, blank, recoloured and duplicated Target fixtures each remained unlocked for 4/4 fresh acquisition attempts. Real quality-pair stream changes required two new observations, eight blank frames remained unlocked, original return reacquired, Scene stayed active and Clear released both trackers and cross acquisition. The original six-case recording was rerun against this same implementation: 671 analyzed pairs and the same 47/49 checkpoints per view. The two pre-existing missing overlays remain documented above.

The release also repeated public angle/distractor tests, four-token/eight-state memory tests, Clear/expiry and the tiny shelf fixture. These passed, including 11/11 tiny positive frames after confirmation and 12/12 each removed/blank/duplicate rejection. All 129 Python tests, 71 focused frontend tests, Ruff and whitespace checks passed; review found no remaining Important issues. Personal fixtures, frame results, annotations and annotated clips remain local under ignored `.local-reference`. This verifies one supplied camera pair and preserves the old regressions; other cameras, severe occlusion, indistinguishable objects and new viewpoints still need device-specific validation.

## Live acquisition and browser parity regression

The 2026-10-06 live failure exposed a repeated dense interior proposal at the browser’s 960×540 Target resolution that failed full-reference confirmation and starved later search. The actual blurry Scene query could also produce no visual-prompt detections. The full-crop gate and existing generic-proposal fallback resolve these paths without lowering any verification threshold or adding a model. Both geometric and cross-camera matching consider all bounded proposals before confirming a unique instance.

The final separate-camera replay uses the browser’s JPEG quality 0.85 and 1280×720 → 960×540 Target resize, alternating Scene tracking and Target matching on all 1080 decoded frames. Scene alone selects the case; Target receives no initialization box or position. Acquisition occurs at 0.195s, followed by 1077 matched results through 35.713s. All 17 reviewed checkpoints after acquisition pass IoU>=0.5; the opening 0.13s checkpoint remains Searching. Removed, blank, recoloured and duplicate fixtures each remain unlocked for 4/4 fresh attempts. Median paired processing is 222 ms, p95 237 ms; Target alone is 113 ms median and 120 ms p95. Sparse truth is not per-frame identity accuracy, and video playback cadence is not live inference FPS.

The six old cases retain 47/49 reviewed checkpoints in each view over 671 pairs at 5 Hz. Both hand postures and the phone’s 29.4s loss/29.6s recovery retain their previous results. The existing face/glasses missing overlays and hand loss after 21.8s remain limitations. The final automated release checks pass 134 Python tests, 71 focused frontend tests and Ruff; focused independent review has no remaining Critical/Important findings. The raw private frames, complete timelines, clips and labels remain local and ignored.

The final captured-pair acceptance acquires within the first six real incoming frames. Replaying those six frames a second time retains 6/6 correct overlays (IoU>=0.5); the second pass adds no new physical motion. Four attempts each of removed, blank, recoloured and duplicated views remain unlocked. The unchanged browser controller and overlay render both correct boxes with actual JPEG requests and the 500 ms freshness check, and Clear removes both. Conservative scheduling causes acquisition latency to vary across runs. The final old-case replay has per-case median paired times of 226–328 ms and p95 values up to 583 ms, including loss/search periods. The latest physical Scene check could not complete because `esp32.local` did not resolve. The normal local server was restored without the temporary capture hook.
