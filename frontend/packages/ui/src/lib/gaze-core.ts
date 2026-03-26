type Point = [number, number]
type Vector3 = [number, number, number]

export type CameraSource =
  | { kind: "usb"; source?: string | number; constraints?: Omit<MediaTrackConstraints, "deviceId"> }
  | { kind: "network"; source: string; crossOrigin?: "" | "anonymous" | "use-credentials" }

export type PointInput = Point | { x: number; y: number }
export type RoiRect = { x: number; y: number; width: number; height: number }
export type RoiCorners = {
  topLeft: PointInput
  topRight: PointInput
  bottomRight: PointInput
  bottomLeft: PointInput
}
export type RoiInput = RoiRect | RoiCorners | [PointInput, PointInput, PointInput, PointInput]
export type EyeCornersInput = { inner: PointInput; outer: PointInput }

export type GazeTrackingInput = {
  cameraSource: CameraSource
  roi?: RoiInput
  eyeCorners: EyeCornersInput
  threshold: number
  pupilBlur?: number
  glintThreshold?: number
  glintBlur?: number
  smoothingFactor?: number
  sphereRadius?: number
  fps?: number
  videoElement?: HTMLVideoElement
}

export type GazeTrackingUpdate = Partial<Omit<GazeTrackingInput, "cameraSource" | "videoElement">>
export type BinaryMask = { width: number; height: number; data: Uint8Array }
export type PupilEllipse = { center: [number, number]; axes: [number, number]; angle: number; score: number }
export type PupilCircle = { center: [number, number]; axes: [number, number]; angle: number }
export type EyeModelPayload = {
  center: [number, number]
  dynamic_center: [number, number]
  radius: number
  corners?: { inner: [number, number]; outer: [number, number] }
}

export type IPupilDetectionReturn = {
  pupilCenter: Point | null
  pupilCenterGlobal: Point | null
  pupilEllipse: PupilEllipse | null
  pupilMask: BinaryMask
  thresholdPreview: BinaryMask
  score: number | null
}

export type GazeVectorReturn = {
  timestamp: number
  gazeVector: Vector3
  iPupilDetectionReturn: IPupilDetectionReturn
  pupilSphereEllipse: PupilEllipse | null
  pupilCircle: PupilCircle | null
  insiderPupilValue: Point | null
  screenPosition: Point | null
  frameSize: { width: number; height: number }
  roi: RoiRect
  glintCenter: Point | null
  eyeModel: EyeModelPayload
}

export type GazePupilDetectionReturn = {
  timestamp: number
  iPupilDetectionReturn: IPupilDetectionReturn
  pupilCircle: PupilCircle | null
  insiderPupilValue: Point | null
  frameSize: { width: number; height: number }
  roi: RoiRect
}

export type GazeListener<T> = (value: T) => void
export interface GazeSession<T> {
  start(): Promise<void>
  stop(): void
  update(next: GazeTrackingUpdate): void
  isRunning(): boolean
  subscribe(listener: GazeListener<T>): () => void
  getLatest(): T | null
  getVideoElement(): HTMLVideoElement
}

type Mode = "vector" | "pupil"
type Ellipse = { center: [number, number]; axes: [number, number]; angle: number }
type Config = {
  cameraSource: CameraSource
  roi?: RoiInput
  eyeCorners: EyeCornersInput
  threshold: number
  pupilBlur: number
  glintThreshold: number
  glintBlur: number
  smoothingFactor: number
  sphereRadius: number
  fps: number
  videoElement?: HTMLVideoElement
}

type Component = {
  area: number
  perimeter: number
  bbox: RoiRect
  points: number[]
  sumX: number
  sumY: number
}

type Detection = {
  pupilCenter: Point | null
  pupilEllipse: Ellipse | null
  pupilMask: Uint8Array
  thresholdPreview: Uint8Array
  score: number
}

const PUPIL_THRESH_DEFAULT = 50
const PUPIL_THRESH_MIN = 10
const PUPIL_THRESH_MAX = 200
const PUPIL_BLUR_DEFAULT = 3
const GLINT_THRESH_DEFAULT = 240
const GLINT_BLUR_DEFAULT = 9
const SMOOTHING_FACTOR_DEFAULT = 0.12
const SPHERE_RADIUS_DEFAULT = 150
const FPS_DEFAULT = 20

class Runtime<T> implements GazeSession<T> {
  private readonly mode: Mode
  private config: Config
  private readonly listeners = new Set<GazeListener<T>>()
  private latest: T | null = null
  private running = false
  private raf = 0
  private lastFrame = 0
  private smoothed: Vector3 = [0, 0, 1]

  private readonly video: HTMLVideoElement
  private ownVideo = false
  private stream: MediaStream | null = null

  private readonly canvas = document.createElement("canvas")
  private readonly ctx = this.canvas.getContext("2d", { willReadFrequently: true })

  constructor(mode: Mode, input: GazeTrackingInput) {
    if (!this.ctx) throw new Error("Unable to initialize canvas context")
    this.mode = mode
    this.config = normalizeConfig(input)
    if (this.config.videoElement) {
      this.video = this.config.videoElement
    } else {
      this.video = document.createElement("video")
      this.video.autoplay = true
      this.video.muted = true
      this.video.playsInline = true
      this.video.style.display = "none"
      this.ownVideo = true
      if (typeof document !== "undefined" && document.body) document.body.appendChild(this.video)
    }
  }

  async start(): Promise<void> {
    if (this.running) return
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      throw new Error("Camera APIs are not available in this environment")
    }
    await this.openSource()
    this.running = true
    this.lastFrame = 0
    this.raf = requestAnimationFrame(this.loop)
  }

  stop(): void {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop()
      this.stream = null
    }
    if (this.video.srcObject) this.video.srcObject = null
    if (this.video.src) {
      this.video.removeAttribute("src")
      this.video.load()
    }
    if (this.ownVideo && this.video.parentElement) this.video.parentElement.removeChild(this.video)
    this.smoothed = [0, 0, 1]
  }

  update(next: GazeTrackingUpdate): void {
    if (next.roi !== undefined) this.config.roi = next.roi
    if (next.eyeCorners) this.config.eyeCorners = next.eyeCorners
    if (typeof next.threshold === "number") this.config.threshold = clamp(next.threshold, PUPIL_THRESH_MIN, PUPIL_THRESH_MAX)
    if (typeof next.pupilBlur === "number") this.config.pupilBlur = odd(next.pupilBlur, 3)
    if (typeof next.glintThreshold === "number") this.config.glintThreshold = clamp(next.glintThreshold, 1, 255)
    if (typeof next.glintBlur === "number") this.config.glintBlur = odd(next.glintBlur, 1)
    if (typeof next.smoothingFactor === "number") this.config.smoothingFactor = clamp(next.smoothingFactor, 0.01, 0.5)
    if (typeof next.sphereRadius === "number") this.config.sphereRadius = Math.max(50, next.sphereRadius)
    if (typeof next.fps === "number") this.config.fps = clamp(next.fps, 1, 120)
  }

  isRunning(): boolean {
    return this.running
  }

  subscribe(listener: GazeListener<T>): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getLatest(): T | null {
    return this.latest
  }

  getVideoElement(): HTMLVideoElement {
    return this.video
  }

  private loop = (t: number): void => {
    if (!this.running) return
    const interval = 1000 / this.config.fps
    if (t - this.lastFrame >= interval) {
      this.lastFrame = t
      this.process()
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  private async openSource(): Promise<void> {
    const src = this.config.cameraSource
    if (src.kind === "usb") {
      const constraints = await usbConstraints(src)
      this.stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false })
      this.video.srcObject = this.stream
      await this.video.play().catch(() => undefined)
      await waitForVideo(this.video)
      return
    }
    this.video.srcObject = null
    this.video.crossOrigin = src.crossOrigin ?? "anonymous"
    this.video.src = src.source
    await waitForVideo(this.video)
    await this.video.play().catch(() => undefined)
  }

  private emit(value: T): void {
    this.latest = value
    for (const cb of this.listeners) cb(value)
  }

  private process(): void {
    const w = this.video.videoWidth
    const h = this.video.videoHeight
    if (w <= 1 || h <= 1) return
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.ctx!.drawImage(this.video, 0, 0, w, h)

    const roi = normalizeRoi(this.config.roi, w, h)
    const eyeCorners = normalizeEyeCorners(this.config.eyeCorners)
    const frame = this.ctx!.getImageData(roi.x, roi.y, roi.width, roi.height)
    const gray = toGray(frame.data)
    const equalized = equalize(gray)

    const [eyeCenter, radius, localCorners] = resolveEyeGeometry(eyeCorners, [roi.x, roi.y], roi.width, roi.height, this.config.sphereRadius)
    const detection = detectPupil(equalized, roi.width, roi.height, [Math.round(eyeCenter[0]), Math.round(eyeCenter[1])], this.config.pupilBlur, this.config.threshold)
    const glint = detectGlint(gray, roi.width, roi.height, this.config.glintBlur, this.config.glintThreshold)

    const dynamicCenter = driftCenter(eyeCenter, detection.pupilCenter, 0.18)
    let screen: Point | null = null
    if (detection.pupilCenter) {
      const fresh = gazeVector3D(detection.pupilCenter, eyeCenter, radius)
      this.smoothed = smooth(this.smoothed, fresh, this.config.smoothingFactor)
      screen = [detection.pupilCenter[0] + roi.x, detection.pupilCenter[1] + roi.y]
    }

    const pupilGlobal = detection.pupilCenter ? [detection.pupilCenter[0] + roi.x, detection.pupilCenter[1] + roi.y] as Point : null
    const pupilEllipse = detection.pupilEllipse ? {
      center: [detection.pupilEllipse.center[0] + roi.x, detection.pupilEllipse.center[1] + roi.y] as [number, number],
      axes: detection.pupilEllipse.axes,
      angle: detection.pupilEllipse.angle,
      score: detection.score >= 0 ? detection.score : 0,
    } : null
    const circle = pupilEllipse ? {
      center: pupilEllipse.center,
      axes: [((pupilEllipse.axes[0] + pupilEllipse.axes[1]) * 0.5), ((pupilEllipse.axes[0] + pupilEllipse.axes[1]) * 0.5)] as [number, number],
      angle: 0,
    } : null

    const common: IPupilDetectionReturn = {
      pupilCenter: detection.pupilCenter,
      pupilCenterGlobal: pupilGlobal,
      pupilEllipse,
      pupilMask: { width: roi.width, height: roi.height, data: detection.pupilMask.slice() },
      thresholdPreview: { width: roi.width, height: roi.height, data: detection.thresholdPreview.slice() },
      score: detection.score >= 0 ? detection.score : null,
    }

    if (this.mode === "vector") {
      const out: GazeVectorReturn = {
        timestamp: Date.now() / 1000,
        gazeVector: [...this.smoothed] as Vector3,
        iPupilDetectionReturn: common,
        pupilSphereEllipse: pupilEllipse,
        pupilCircle: circle,
        insiderPupilValue: pupilGlobal,
        screenPosition: screen,
        frameSize: { width: roi.width, height: roi.height },
        roi,
        glintCenter: glint ? [glint[0] + roi.x, glint[1] + roi.y] : null,
        eyeModel: {
          center: [eyeCenter[0] + roi.x, eyeCenter[1] + roi.y],
          dynamic_center: [dynamicCenter[0] + roi.x, dynamicCenter[1] + roi.y],
          radius,
          corners: localCorners ? {
            inner: [localCorners[0][0] + roi.x, localCorners[0][1] + roi.y],
            outer: [localCorners[1][0] + roi.x, localCorners[1][1] + roi.y],
          } : undefined,
        },
      }
      this.emit(out as T)
      return
    }

    const out: GazePupilDetectionReturn = {
      timestamp: Date.now() / 1000,
      iPupilDetectionReturn: common,
      pupilCircle: circle,
      insiderPupilValue: pupilGlobal,
      frameSize: { width: roi.width, height: roi.height },
      roi,
    }
    this.emit(out as T)
  }
}

export function gazeVector(input: GazeTrackingInput, listener?: GazeListener<GazeVectorReturn>): GazeSession<GazeVectorReturn> {
  const rt = new Runtime<GazeVectorReturn>("vector", input)
  if (listener) rt.subscribe(listener)
  return rt
}

export function gazePupilDetection(input: GazeTrackingInput, listener?: GazeListener<GazePupilDetectionReturn>): GazeSession<GazePupilDetectionReturn> {
  const rt = new Runtime<GazePupilDetectionReturn>("pupil", input)
  if (listener) rt.subscribe(listener)
  return rt
}

function normalizeConfig(input: GazeTrackingInput): Config {
  if (!input.cameraSource) throw new Error("cameraSource is required")
  if (!input.eyeCorners) throw new Error("eyeCorners are required")
  return {
    cameraSource: input.cameraSource,
    roi: input.roi,
    eyeCorners: input.eyeCorners,
    threshold: clamp(Number.isFinite(input.threshold) ? input.threshold : PUPIL_THRESH_DEFAULT, PUPIL_THRESH_MIN, PUPIL_THRESH_MAX),
    pupilBlur: odd(input.pupilBlur ?? PUPIL_BLUR_DEFAULT, 3),
    glintThreshold: clamp(input.glintThreshold ?? GLINT_THRESH_DEFAULT, 1, 255),
    glintBlur: odd(input.glintBlur ?? GLINT_BLUR_DEFAULT, 1),
    smoothingFactor: clamp(input.smoothingFactor ?? SMOOTHING_FACTOR_DEFAULT, 0.01, 0.5),
    sphereRadius: Math.max(50, input.sphereRadius ?? SPHERE_RADIUS_DEFAULT),
    fps: clamp(input.fps ?? FPS_DEFAULT, 1, 120),
    videoElement: input.videoElement,
  }
}

async function usbConstraints(src: Extract<CameraSource, { kind: "usb" }>): Promise<MediaTrackConstraints> {
  const base = { ...(src.constraints ?? {}) } as MediaTrackConstraints
  if (src.source === undefined || src.source === null || src.source === "") return base
  if (typeof src.source === "string" && Number.isNaN(Number(src.source))) return { ...base, deviceId: { exact: src.source } }
  const idx = Number(src.source)
  if (!Number.isInteger(idx) || idx < 0) return base
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput")
    if (!devices[idx]?.deviceId) return base
    return { ...base, deviceId: { exact: devices[idx].deviceId } }
  } catch {
    return base
  }
}

async function waitForVideo(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) return
  await new Promise<void>((resolve, reject) => {
    const ok = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        clean()
        resolve()
      }
    }
    const fail = () => {
      clean()
      reject(new Error("Unable to load video source"))
    }
    const clean = () => {
      video.removeEventListener("loadedmetadata", ok)
      video.removeEventListener("canplay", ok)
      video.removeEventListener("error", fail)
    }
    video.addEventListener("loadedmetadata", ok)
    video.addEventListener("canplay", ok)
    video.addEventListener("error", fail)
  })
}

function normalizePoint(p: PointInput, label: string): Point {
  if (Array.isArray(p)) return [Number(p[0]), Number(p[1])]
  if (p && typeof p === "object") return [Number(p.x), Number(p.y)]
  throw new Error(`${label} must be [x,y] or {x,y}`)
}

function normalizeEyeCorners(corners: EyeCornersInput): { inner: Point; outer: Point } {
  return { inner: normalizePoint(corners.inner, "eyeCorners.inner"), outer: normalizePoint(corners.outer, "eyeCorners.outer") }
}

function normalizeRoi(roi: RoiInput | undefined, w: number, h: number): RoiRect {
  if (!roi) return { x: 0, y: 0, width: w, height: h }
  if (!Array.isArray(roi) && "x" in roi) return clampRoi(roi, w, h)
  const corners = Array.isArray(roi)
    ? [normalizePoint(roi[0], "roi[0]"), normalizePoint(roi[1], "roi[1]"), normalizePoint(roi[2], "roi[2]"), normalizePoint(roi[3], "roi[3]")]
    : [normalizePoint(roi.topLeft, "roi.topLeft"), normalizePoint(roi.topRight, "roi.topRight"), normalizePoint(roi.bottomRight, "roi.bottomRight"), normalizePoint(roi.bottomLeft, "roi.bottomLeft")]
  const [tl, tr, br, bl] = corners
  const top = norm([tr[0] - tl[0], tr[1] - tl[1]])
  const left = norm([bl[0] - tl[0], bl[1] - tl[1]])
  const bottom = norm([br[0] - bl[0], br[1] - bl[1]])
  const right = norm([br[0] - tr[0], br[1] - tr[1]])
  const rightAngle = Math.abs(top[0] * left[0] + top[1] * left[1])
  const parallel = Math.abs(top[0] * bottom[1] - top[1] * bottom[0]) + Math.abs(left[0] * right[1] - left[1] * right[0])
  if (rightAngle > 0.2 || parallel > 0.4) throw new Error("ROI corners must form a rectangle")
  const xs = corners.map((p) => p[0])
  const ys = corners.map((p) => p[1])
  return clampRoi({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }, w, h)
}

function clampRoi(roi: { x: number; y: number; width: number; height: number }, w: number, h: number): RoiRect {
  const x = clamp(Math.round(roi.x), 0, Math.max(0, w - 1))
  const y = clamp(Math.round(roi.y), 0, Math.max(0, h - 1))
  const width = clamp(Math.round(roi.width), 1, Math.max(1, w - x))
  const height = clamp(Math.round(roi.height), 1, Math.max(1, h - y))
  return { x, y, width, height }
}

function resolveEyeGeometry(corners: { inner: Point; outer: Point }, offset: Point, w: number, h: number, fallback: number): [[number, number], number, [[number, number], [number, number]]] {
  const inner: [number, number] = [corners.inner[0] - offset[0], corners.inner[1] - offset[1]]
  const outer: [number, number] = [corners.outer[0] - offset[0], corners.outer[1] - offset[1]]
  const center: [number, number] = [(inner[0] + outer[0]) * 0.5, (inner[1] + outer[1]) * 0.5]
  let radius = Math.hypot(outer[0] - inner[0], outer[1] - inner[1]) * 0.5
  if (!Number.isFinite(radius) || radius < 1) radius = clamp(fallback, 8, Math.min(w, h) * 0.49)
  radius = clamp(radius, 8, Math.max(w, h) * 4)
  return [center, radius, [inner, outer]]
}

function toGray(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) out[j] = Math.round(rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114)
  return out
}

function equalize(gray: Uint8Array): Uint8Array {
  const hist = new Uint32Array(256)
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1
  const cdf = new Uint32Array(256)
  let run = 0
  for (let i = 0; i < 256; i += 1) { run += hist[i]; cdf[i] = run }
  let cdfMin = 0
  for (let i = 0; i < 256; i += 1) if (hist[i] > 0) { cdfMin = cdf[i]; break }
  if (gray.length <= cdfMin) return gray.slice()
  const out = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i += 1) out[i] = clamp(Math.round(((cdf[gray[i]] - cdfMin) / (gray.length - cdfMin)) * 255), 0, 255)
  return out
}

function detectPupil(gray: Uint8Array, w: number, h: number, center: Point, blurSize: number, thresh: number): Detection {
  const blur = gaussian(gray, w, h, odd(blurSize, 3))
  const thr = sliderToThreshold(thresh)
  const binary = new Uint8Array(blur.length)
  for (let i = 0; i < blur.length; i += 1) binary[i] = blur[i] > thr ? 0 : 255
  const adaptive = adaptiveInv(blur, w, h, Math.max(11, odd(blurSize, 3) * 5), clamp(Math.floor(thresh * 0.25), 2, 15))
  const darkCutoff = percentile(blur, 0.18)
  const dark = new Uint8Array(blur.length)
  for (let i = 0; i < blur.length; i += 1) dark[i] = blur[i] <= darkCutoff ? 255 : 0
  let mask = and(binary, and(adaptive, dark))
  if (count(mask) < Math.max(12, Math.floor(w * h * 0.00015))) mask = binary
  mask = morph(mask, w, h)

  const comps = components(mask, w, h)
  const minArea = Math.max(60, Math.floor(w * h * 0.0008))
  const maxArea = Math.max(minArea + 1, Math.floor(w * h * 0.06))
  const targetArea = Math.max(minArea, Math.floor(w * h * 0.02))

  let best: Component | null = null
  let bestScore = -1
  for (const c of comps) {
    if (c.area < minArea || c.area > maxArea || c.perimeter <= 0) continue
    const circularity = clamp((4 * Math.PI * c.area) / (c.perimeter * c.perimeter), 0, 1)
    const aspect = clamp(Math.min(c.bbox.width, c.bbox.height) / Math.max(c.bbox.width, c.bbox.height), 0, 1)
    if (aspect < 0.35) continue
    const fill = clamp(c.area / (c.bbox.width * c.bbox.height), 0, 1)
    const mean = componentMean(c, gray, w)
    const darkness = clamp(1 - mean / 255, 0, 1)
    const cx = c.bbox.x + c.bbox.width / 2
    const cy = c.bbox.y + c.bbox.height / 2
    const dist = Math.hypot(cx - center[0], cy - center[1])
    const distScore = 1 - clamp(dist / Math.max(1, Math.max(w, h) * 0.7), 0, 1)
    const areaScore = 1 - clamp(Math.abs(c.area - targetArea) / Math.max(1, targetArea), 0, 1)
    const edge = Math.min(c.bbox.x, c.bbox.y, w - (c.bbox.x + c.bbox.width), h - (c.bbox.y + c.bbox.height))
    const edgeScore = clamp(edge / Math.max(1, Math.min(w, h) * 0.25), 0, 1)
    const score = circularity * 0.22 + darkness * 0.25 + fill * 0.15 + aspect * 0.08 + areaScore * 0.1 + distScore * 0.15 + edgeScore * 0.05
    if (score > bestScore) { bestScore = score; best = c }
  }

  if (!best) return { pupilCenter: null, pupilEllipse: null, pupilMask: mask.slice(), thresholdPreview: mask.slice(), score: -1 }
  const pupilMask = new Uint8Array(mask.length)
  for (let i = 0; i < best.points.length; i += 2) pupilMask[best.points[i + 1] * w + best.points[i]] = 255
  const centerPoint: Point = [Math.round(best.sumX / best.area), Math.round(best.sumY / best.area)]
  const ellipse = fit(best.points, centerPoint, best.area)
  return { pupilCenter: centerPoint, pupilEllipse: ellipse, pupilMask, thresholdPreview: mask.slice(), score: bestScore }
}

function detectGlint(gray: Uint8Array, w: number, h: number, blurSize: number, threshold: number): Point | null {
  const blur = gaussian(gray, w, h, odd(blurSize, 1))
  const mask = new Uint8Array(blur.length)
  for (let i = 0; i < blur.length; i += 1) mask[i] = blur[i] > threshold ? 255 : 0
  for (const c of components(mask, w, h)) if (c.area > 2) return [Math.round(c.sumX / c.area), Math.round(c.sumY / c.area)]
  return null
}

function fit(points: number[], fallback: Point, area: number): Ellipse | null {
  if (points.length < 10) {
    const d = Math.max(4, 2 * Math.sqrt(Math.max(1, area) / Math.PI))
    return { center: [fallback[0], fallback[1]], axes: [d, d], angle: 0 }
  }
  const n = points.length / 2
  let mx = 0
  let my = 0
  for (let i = 0; i < points.length; i += 2) { mx += points[i]; my += points[i + 1] }
  mx /= n
  my /= n
  let cxx = 0
  let cyy = 0
  let cxy = 0
  for (let i = 0; i < points.length; i += 2) {
    const dx = points[i] - mx
    const dy = points[i + 1] - my
    cxx += dx * dx
    cyy += dy * dy
    cxy += dx * dy
  }
  cxx /= n
  cyy /= n
  cxy /= n
  const tr = cxx + cyy
  const det = cxx * cyy - cxy * cxy
  const root = Math.sqrt(Math.max(0, tr * tr - 4 * det))
  const l1 = Math.max(1e-6, 0.5 * (tr + root))
  const l2 = Math.max(1e-6, 0.5 * (tr - root))
  const axes: [number, number] = [Math.max(4, 4 * Math.sqrt(l1)), Math.max(4, 4 * Math.sqrt(l2))]
  return { center: [mx, my], axes, angle: (0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180) / Math.PI }
}

function gazeVector3D(pupil: Point, center: [number, number], radius: number): Vector3 {
  if (radius <= 1e-6) return [0, 0, 1]
  let nx = (pupil[0] - center[0]) / radius
  let ny = (pupil[1] - center[1]) / radius
  const radial = Math.hypot(nx, ny)
  if (radial >= 0.999) { const s = 0.999 / Math.max(radial, 1e-6); nx *= s; ny *= s }
  const nz = Math.sqrt(Math.max(1e-6, 1 - nx * nx - ny * ny))
  return normalize3([nx, ny, nz]) ?? [0, 0, 1]
}

function driftCenter(center: [number, number], pupil: Point | null, gain: number): [number, number] {
  if (!pupil) return center
  return [center[0] + (pupil[0] - center[0]) * gain, center[1] + (pupil[1] - center[1]) * gain]
}

function smooth(prev: Vector3, next: Vector3, k: number): Vector3 {
  return [k * next[0] + (1 - k) * prev[0], k * next[1] + (1 - k) * prev[1], k * next[2] + (1 - k) * prev[2]]
}

function gaussian(gray: Uint8Array, w: number, h: number, size: number): Uint8Array {
  if (size <= 1) return gray.slice()
  const r = Math.floor(size / 2)
  const sigma = Math.max(0.8, size / 3)
  const k = new Float32Array(size)
  let s = 0
  for (let i = -r; i <= r; i += 1) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; s += v }
  for (let i = 0; i < size; i += 1) k[i] /= s
  const tmp = new Float32Array(gray.length)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let v = 0
    for (let i = -r; i <= r; i += 1) v += gray[y * w + clamp(x + i, 0, w - 1)] * k[i + r]
    tmp[y * w + x] = v
  }
  const out = new Uint8Array(gray.length)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let v = 0
    for (let i = -r; i <= r; i += 1) v += tmp[clamp(y + i, 0, h - 1) * w + x] * k[i + r]
    out[y * w + x] = clamp(Math.round(v), 0, 255)
  }
  return out
}

function adaptiveInv(gray: Uint8Array, w: number, h: number, block: number, c: number): Uint8Array {
  const half = Math.floor(odd(block, 3) / 2)
  const ii = new Uint32Array((w + 1) * (h + 1))
  for (let y = 1; y <= h; y += 1) for (let x = 1; x <= w; x += 1) ii[y * (w + 1) + x] = gray[(y - 1) * w + (x - 1)] + ii[(y - 1) * (w + 1) + x] + ii[y * (w + 1) + (x - 1)] - ii[(y - 1) * (w + 1) + (x - 1)]
  const out = new Uint8Array(gray.length)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const x0 = clamp(x - half, 0, w - 1)
    const x1 = clamp(x + half, 0, w - 1)
    const y0 = clamp(y - half, 0, h - 1)
    const y1 = clamp(y + half, 0, h - 1)
    const area = (x1 - x0 + 1) * (y1 - y0 + 1)
    const sum = ii[(y1 + 1) * (w + 1) + (x1 + 1)] - ii[y0 * (w + 1) + (x1 + 1)] - ii[(y1 + 1) * (w + 1) + x0] + ii[y0 * (w + 1) + x0]
    out[y * w + x] = gray[y * w + x] > sum / area - c ? 0 : 255
  }
  return out
}

function morph(mask: Uint8Array, w: number, h: number): Uint8Array {
  const near: Point[] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
  const dil = new Uint8Array(mask.length)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let on = false
    for (const [dx, dy] of near) { const px = x + dx; const py = y + dy; if (px >= 0 && py >= 0 && px < w && py < h && mask[py * w + px] > 0) { on = true; break } }
    dil[y * w + x] = on ? 255 : 0
  }
  const ero = new Uint8Array(mask.length)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let on = true
    for (const [dx, dy] of near) { const px = x + dx; const py = y + dy; if (px < 0 || py < 0 || px >= w || py >= h || dil[py * w + px] === 0) { on = false; break } }
    ero[y * w + x] = on ? 255 : 0
  }
  return ero
}

function components(mask: Uint8Array, w: number, h: number): Component[] {
  const vis = new Uint8Array(mask.length)
  const near: Point[] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
  const edge: Point[] = [[0, -1], [1, 0], [0, 1], [-1, 0]]
  const out: Component[] = []
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const start = y * w + x
    if (!mask[start] || vis[start]) continue
    const qx: number[] = [x]
    const qy: number[] = [y]
    vis[start] = 1
    let head = 0
    let area = 0
    let perimeter = 0
    let minX = x
    let minY = y
    let maxX = x
    let maxY = y
    let sumX = 0
    let sumY = 0
    const points: number[] = []
    while (head < qx.length) {
      const cx = qx[head]
      const cy = qy[head]
      head += 1
      area += 1
      sumX += cx
      sumY += cy
      points.push(cx, cy)
      if (cx < minX) minX = cx
      if (cy < minY) minY = cy
      if (cx > maxX) maxX = cx
      if (cy > maxY) maxY = cy
      for (const [dx, dy] of edge) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || mask[ny * w + nx] === 0) perimeter += 1
      }
      for (const [dx, dy] of near) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const idx = ny * w + nx
        if (!mask[idx] || vis[idx]) continue
        vis[idx] = 1
        qx.push(nx)
        qy.push(ny)
      }
    }
    out.push({ area, perimeter, bbox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }, points, sumX, sumY })
  }
  return out
}

function componentMean(c: Component, gray: Uint8Array, w: number): number {
  if (c.area <= 0) return 0
  let sum = 0
  for (let i = 0; i < c.points.length; i += 2) sum += gray[c.points[i + 1] * w + c.points[i]]
  return sum / c.area
}

function and(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] && b[i] ? 255 : 0
  return out
}

function count(values: Uint8Array): number {
  let n = 0
  for (let i = 0; i < values.length; i += 1) if (values[i]) n += 1
  return n
}

function percentile(values: Uint8Array, q: number): number {
  const hist = new Uint32Array(256)
  for (let i = 0; i < values.length; i += 1) hist[values[i]] += 1
  const target = Math.floor(clamp(q, 0, 1) * values.length)
  let run = 0
  for (let i = 0; i < 256; i += 1) { run += hist[i]; if (run >= target) return i }
  return 255
}

function sliderToThreshold(value: number): number {
  const v = clamp(Math.round(value), PUPIL_THRESH_MIN, PUPIL_THRESH_MAX)
  return Math.round(((v - PUPIL_THRESH_MIN) / (PUPIL_THRESH_MAX - PUPIL_THRESH_MIN)) * 255)
}

function normalize3(v: Vector3): Vector3 | null {
  const m = Math.hypot(v[0], v[1], v[2])
  if (!Number.isFinite(m) || m <= 1e-8) return null
  return [v[0] / m, v[1] / m, v[2] / m]
}

function odd(v: number, min: number): number {
  let out = Math.max(min, Math.round(v))
  if (out % 2 === 0) out += 1
  return out
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function norm(v: [number, number]): [number, number] {
  const m = Math.hypot(v[0], v[1])
  if (m <= 1e-8) return [0, 0]
  return [v[0] / m, v[1] / m]
}
