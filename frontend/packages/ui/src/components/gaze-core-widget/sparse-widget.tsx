import { Button } from "@workspace/ui/components/button"
import { useSparseSamplingSetupWidget, type SparseSamplingSetupState } from "../../hooks/use-sparse-sampling-setup"
import type { GazeCoreWidgetProps } from "./types"
import { SectionCard } from "./SectionCard"

export function GazeCoreSparseSamplingWidget(props: GazeCoreWidgetProps = {}) {
  const state = useSparseSamplingSetupWidget(props)
  return <GazeCoreSparseSamplingWidgetView state={state} />
}

function GazeCoreSparseSamplingWidgetView({ state }: { state: SparseSamplingSetupState }) {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="border-b px-6 py-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-semibold">GazeCore Sparse Sampling Widget</h1>
            <p className="text-sm text-muted-foreground">
              Keep the existing source and ROI flow, then trace the darkest sampled point inside the selected eye region.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            Component path: <code>@workspace/ui/components/gaze-core-widget</code>
          </div>
        </div>
      </header>

      <SparseStepProgress state={state} />

      <div className="flex flex-1 flex-col gap-6 p-6 lg:flex-row">
        <SparseWidgetPanel state={state} />

        <div className="flex flex-1 flex-col gap-4">
          <SparseSourceStep state={state} />
          <SparseRoiStep state={state} />
          <SparseSamplingStep state={state} />
          <PupilContourStep state={state} />
          <SparseLiveDataStep state={state} />
        </div>
      </div>
    </main>
  )
}

function SparseStepProgress({ state }: { state: SparseSamplingSetupState }) {
  return (
    <div className="px-6 pt-4">
      <div className="flex gap-2">
        {state.steps.map((step, index) => (
          <div
            key={step}
            className={`flex-1 rounded-full py-1 text-center text-xs font-medium ${
              index < state.stepIndex
                ? "bg-primary/30 text-primary"
                : index === state.stepIndex
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {step === "source" ? "source" : step === "roi" ? "roi" : step === "sampling" ? "sparse sampling" : "pupil contour"}
          </div>
        ))}
      </div>
    </div>
  )
}

function SparseWidgetPanel({ state }: { state: SparseSamplingSetupState }) {
  return (
    <div className="flex shrink-0 flex-col gap-4">
      <canvas
        ref={state.canvasRef}
        width={640}
        height={480}
        className="rounded-lg border bg-muted"
        style={{ imageRendering: "pixelated", maxWidth: "100%" }}
        onMouseDown={state.onCanvasMouseDown}
        onMouseMove={state.onCanvasMouseMove}
        onMouseUp={state.onCanvasMouseUp}
        onMouseLeave={state.onCanvasMouseUp}
      />

      {(state.currentStep === "sampling" || state.currentStep === "pupil") && (
        <canvas
          ref={state.samplingCanvasRef}
          width={640}
          height={320}
          className="rounded-lg border bg-[#050a12]"
          style={{ imageRendering: "pixelated", maxWidth: "100%" }}
        />
      )}

      {state.previewError && <p className="text-sm text-destructive">{state.previewError}</p>}
    </div>
  )
}

function SparseSourceStep({ state }: { state: SparseSamplingSetupState }) {
  if (state.currentStep !== "source") return null

  return (
    <SectionCard title="Camera Source">
      <div className="space-y-1">
        <p className="text-sm font-medium">Camera type</p>
        <div className="flex gap-2">
          <Button variant={state.kind === "usb" ? "default" : "outline"} onClick={() => state.setKind("usb")}>USB Camera</Button>
          <Button variant={state.kind === "network" ? "default" : "outline"} onClick={() => state.setKind("network")}>Network Stream</Button>
        </div>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{state.kind === "usb" ? "Camera index or device id" : "Stream URL"}</span>
        <input
          value={state.source}
          onChange={(event) => state.setSource(event.target.value)}
          placeholder={state.kind === "usb" ? "0" : "https://example.com/stream.m3u8"}
          className="w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring/50"
        />
      </label>

      <div className="flex gap-2">
        {!state.previewActive ? (
          <Button onClick={() => void state.openPreview()}>Start Preview</Button>
        ) : (
          <Button variant="outline" onClick={state.closePreview}>Stop Preview</Button>
        )}
      </div>

      {state.previewActive && <CameraExposurePanel state={state} />}

      <div className="flex justify-end">
        <Button onClick={() => state.goToStep("roi")} disabled={!state.previewActive}>
          Next: Set ROI
        </Button>
      </div>
    </SectionCard>
  )
}

function CameraExposurePanel({ state }: { state: SparseSamplingSetupState }) {
  const exposure = state.exposureState
  const exposureTime = exposure.exposureTime ?? exposure.exposureTimeRange?.min ?? 0

  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-foreground">Camera Exposure</p>
          <p className="text-muted-foreground">
            Mode: <span className="font-mono text-foreground">{exposure.mode}</span>
          </p>
          <p className="text-muted-foreground">
            Exposure time: <span className="font-mono text-foreground">{formatExposureValue(exposure.exposureTime)}</span>
          </p>
          <p className="text-muted-foreground">
            ISO: <span className="font-mono text-foreground">{formatExposureValue(exposure.iso)}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!exposure.autoSupported}
            onClick={() => void state.setAutoExposure()}
          >
            Auto
          </Button>
          <Button
            variant="outline"
            disabled={!exposure.manualSupported}
            onClick={() => void state.lockManualExposure()}
          >
            Lock Manual
          </Button>
          <Button variant="outline" onClick={state.refreshExposureState}>
            Refresh
          </Button>
        </div>
      </div>

      {exposure.exposureTimeRange && (
        <label className="mt-3 block space-y-2">
          <span className="flex items-center justify-between text-muted-foreground">
            <span>Manual exposure time</span>
            <span className="font-mono text-foreground">{formatExposureValue(exposureTime)}</span>
          </span>
          <input
            type="range"
            min={exposure.exposureTimeRange.min}
            max={exposure.exposureTimeRange.max}
            step={exposure.exposureTimeRange.step ?? 1}
            value={exposureTime}
            disabled={!exposure.exposureTimeSupported}
            onChange={(event) => void state.setManualExposureTime(Number(event.target.value))}
            className="w-full"
          />
          <span className="flex justify-between font-mono text-xs text-muted-foreground">
            <span>{formatExposureValue(exposure.exposureTimeRange.min)}</span>
            <span>{formatExposureValue(exposure.exposureTimeRange.max)}</span>
          </span>
        </label>
      )}

      {exposure.modes.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Supported modes: <span className="font-mono text-foreground">{exposure.modes.join(", ")}</span>
        </p>
      )}

      {exposure.error && (
        <p className="mt-3 text-xs text-muted-foreground">{exposure.error}</p>
      )}
    </div>
  )
}

function SparseRoiStep({ state }: { state: SparseSamplingSetupState }) {
  if (state.currentStep !== "roi") return null

  return (
    <SectionCard title="Region Of Interest">
      <p className="text-sm text-muted-foreground">Drag the corner handles on the left preview to adjust the region.</p>
      <div className="grid grid-cols-2 gap-3">
        {(["x", "y", "width", "height"] as const).map((field) => (
          <label key={field} className="space-y-1 text-sm">
            <span className="font-medium capitalize">{field}</span>
            <input
              type="number"
              value={state.roi[field]}
              onChange={(event) => {
                state.setRoi({
                  ...state.roi,
                  [field]: Number(event.target.value),
                })
              }}
              onBlur={state.pushUpdate}
              className="w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring/50"
            />
          </label>
        ))}
      </div>
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => state.goToStep("source")}>Back</Button>
        <Button onClick={() => state.goToStep("sampling")}>Next: Sparse Sampling</Button>
      </div>
    </SectionCard>
  )
}

function formatExposureValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a"
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function SparseSamplingStep({ state }: { state: SparseSamplingSetupState }) {
  if (state.currentStep !== "sampling") return null

  const darkestSample = state.latestSamplingResult?.darkestSample ?? null

  return (
    <SectionCard title="Sparse Sampling">
      <p className="text-sm text-muted-foreground">
        The ROI is sampled end-to-end in 5 x 5 blocks. Sparse samples propose candidates, and contour scoring chooses the tracked pupil point.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium text-foreground">Sparse grid</p>
          <p className="mt-2 text-muted-foreground">
            {state.latestSamplingResult
              ? `${state.latestSamplingResult.sampleColumns} x ${state.latestSamplingResult.sampleRows} samples`
              : "Waiting for preview data"}
          </p>
          <p className="text-muted-foreground">
            Total sampled points: {state.latestSamplingResult?.samples.length ?? 0}
          </p>
        </div>

        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium text-foreground">Tracked pupil point</p>
          <p className="mt-2 text-muted-foreground">
            ROI: {state.latestSamplingResult ? `${state.latestSamplingResult.darkestPixel.local[0]}, ${state.latestSamplingResult.darkestPixel.local[1]}` : "n/a"}
          </p>
          <p className="text-muted-foreground">
            Frame: {state.latestSamplingResult ? `${state.latestSamplingResult.darkestPixel.global[0]}, ${state.latestSamplingResult.darkestPixel.global[1]}` : "n/a"}
          </p>
          <p className="text-muted-foreground">
            Region value: {darkestSample ? darkestSample.average.toFixed(1) : "n/a"}
          </p>
          <p className="text-muted-foreground">
            Pixel value: {state.latestSamplingResult ? state.latestSamplingResult.darkestPixel.value : "n/a"}
          </p>
          <p className="text-muted-foreground">
            Seed confidence: {state.latestSamplingResult ? `${Math.round(state.latestSamplingResult.seedConfidence * 100)}%` : "n/a"}
          </p>
          <p className="text-muted-foreground">
            Tracking: {state.latestSamplingResult?.trackingStatus ?? "n/a"}
          </p>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => state.goToStep("roi")}>Back</Button>
        <Button onClick={() => state.goToStep("pupil")}>Next: Pupil Contour</Button>
      </div>
    </SectionCard>
  )
}

function PupilContourStep({ state }: { state: SparseSamplingSetupState }) {
  if (state.currentStep !== "pupil") return null

  const contour = state.latestSamplingResult?.pupilContour ?? null

  return (
    <SectionCard title="Pupil Contour">
      <p className="text-sm text-muted-foreground">
        Binary search chooses a threshold that captures a compact pupil contour around the sparse-sampling seed.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium text-foreground">Binary threshold</p>
          <p className="mt-2 text-muted-foreground">
            Threshold: {contour ? contour.threshold : "n/a"}
          </p>
          <p className="text-muted-foreground">
            Confidence: {contour ? `${Math.round(contour.confidence * 100)}%` : "rejected below 55%"}
          </p>
          <p className="text-muted-foreground">
            Center: {contour ? `${contour.globalCenter[0]}, ${contour.globalCenter[1]}` : "n/a"}
          </p>
        </div>

        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium text-foreground">Pupil count</p>
          <p className="mt-2 text-muted-foreground">
            Pupil pixels: {contour ? contour.pupilPixelCount : "n/a"}
          </p>
          <p className="text-muted-foreground">
            Contour points: {contour ? contour.contourPointCount : "n/a"}
          </p>
          <p className="text-muted-foreground">
            Box: {contour ? `${contour.boundingBox.width} x ${contour.boundingBox.height}` : "n/a"}
          </p>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => state.goToStep("sampling")}>Back</Button>
      </div>
    </SectionCard>
  )
}

function SparseLiveDataStep({ state }: { state: SparseSamplingSetupState }) {
  const darkestSample = state.latestSamplingResult?.darkestSample ?? null

  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-base font-semibold text-foreground">Live Data</h2>
      </header>
      <div className="space-y-2 px-4 py-4 text-sm text-muted-foreground">
        <p>
          Preview: <span className="font-medium text-foreground">{state.previewActive ? "running" : "stopped"}</span>
        </p>
        <p>
          ROI: <span className="font-mono text-foreground">{`${state.roi.x}, ${state.roi.y}, ${state.roi.width}, ${state.roi.height}`}</span>
        </p>
        <p>
          Sparse grid: <span className="font-mono text-foreground">{state.latestSamplingResult ? `${state.latestSamplingResult.sampleColumns} x ${state.latestSamplingResult.sampleRows}` : "n/a"}</span>
        </p>
        <p>
          Tracked center: <span className="font-mono text-foreground">{darkestSample ? `${darkestSample.globalCenter[0]}, ${darkestSample.globalCenter[1]}` : "n/a"}</span>
        </p>
        <p>
          Tracked dark pixel: <span className="font-mono text-foreground">{state.latestSamplingResult ? `${state.latestSamplingResult.darkestPixel.global[0]}, ${state.latestSamplingResult.darkestPixel.global[1]} (${state.latestSamplingResult.darkestPixel.value})` : "n/a"}</span>
        </p>
        <p>
          Tracking confidence: <span className="font-mono text-foreground">{state.latestSamplingResult ? `${Math.round(state.latestSamplingResult.seedConfidence * 100)}% ${state.latestSamplingResult.trackingStatus}` : "n/a"}</span>
        </p>
        <p>
          Pupil contour: <span className="font-mono text-foreground">{state.latestSamplingResult?.pupilContour ? `${state.latestSamplingResult.pupilContour.pupilPixelCount} px, ${state.latestSamplingResult.pupilContour.contourPointCount} edge` : "rejected"}</span>
        </p>
      </div>
    </section>
  )
}
