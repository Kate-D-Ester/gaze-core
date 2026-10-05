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

These are distinct algorithm scores: object presence, predicted mask quality, memory-token similarity, descriptor similarity and geometric inlier ratio are **not calibrated identity probabilities**. The Tracking overlay deliberately does not display an identity percentage. Similar-looking objects, long disappearance, rapid motion and substantial new viewpoints remain limitations.

## Replay method

Each case runs independently from its selection time through the recording's final real frame. By default Scene and Target receive identical video pixels, but Target receives only the Scene token and independently acquires its box. The evaluator also supports a mildly transformed copy. Neither mode measures independent physical-camera accuracy.

Private video, annotations, per-frame JSON, checkpoint sheets and annotated clips stay under ignored `.local-reference`. Hand truth annotations stop at 20 seconds and phone annotations at 30 seconds; later status logs continue through the endpoint without a ground-truth accuracy claim. Model scores and the fraction of frames displaying boxes are not tracking accuracy.

## Paired product replay and acceptance

| Case | Scene checkpoints | Target checkpoints | Median pair ms |
| --- | --- | --- | --- |
| face | 13/14 | 13/14 | 209 |
| glasses | 11/12 | 11/12 | 204 |
| clothing | 8/8 | 8/8 | 211 |
| hand-open | 7/7 | 7/7 | 212 |
| hand-closed | 4/4 | 4/4 | 236 |
| phone | 4/4 | 4/4 | 204 |

The complete current pipeline passed 47/49 sparse checkpoints in each view at 5 analyzed frames per second, across 671 frame pairs through the final real frame. Each Target independently acquired the selected instance. Failed checkpoints were absent overlays for face at 18s and glasses at 26s, rather than accepted wrong boxes. This is a substantial improvement over the original-reference NanoTrack path, which passed 13/49 Scene and 14/49 Target checkpoints on the same cases at a different analysis cadence. These local comparisons do not establish a general accuracy percentage or physical-camera matching performance.

Tracking still has brief gaps. Both hand cases lose the changed/occluded hand after about 22s and stay Searching through the endpoint; hand truth annotations stop at 20s. The phone's fast movement at 29.4s now enters Searching briefly and reacquires at 29.6s; its 30s checkpoint passes. It becomes absent/occluded again at 31.6s and remains Searching through the endpoint. Sparse annotations cannot rule out errors between checkpoints. Typical paired analysis takes about 204–236 ms on this M1 Pro, with per-case p95 values up to 355 ms; this is not a 30 fps live inference claim.

The final real-model acceptance checks passed same-category distractor disappearance, original return, independent Target reset, four interleaved tokens/eight camera states and memory release on Clear/expiry. Four selections used about 419 MB of allocated MPS memory in that fixture; Clear released all eight tracker states and returned allocation to about 276 MB. The public angle smoke check passed 0/5/15 degrees and healthy Scene/nonmatching Target pairs without Scene deactivation. The final Python suite passed 115 tests and focused viewer/tooling tests passed 71.
