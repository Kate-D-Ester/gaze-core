import { Camera, LoaderCircle } from "lucide-react"
import {
  RemotePreviewStyles,
  RemotePreviewOverlayStyles,
  RemotePreviewPlaceholderStyles,
  RemoteSpinStyles,
} from "@/features/tracking-ui/remote-styles"
import type { RemoteCameraPreviewProps } from "./remote-camera-preview.types"
export function RemoteCameraPreview({
  observation,
  mode,
  roi,
  replaying,
  selecting,
  status,
  videoRef,
  onPointerDown,
  onPointerUp,
}: RemoteCameraPreviewProps) {
  return (
    <div
      className={`remote-preview ${RemotePreviewStyles} ${mode === "ir" || replaying ? "" : "mirrored"} ${selecting ? "selecting" : ""}`}
      style={{
        aspectRatio: observation
          ? `${observation.width}/${observation.height}`
          : "16/9",
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        controls={replaying}
        aria-label={replaying ? "Local video recording" : "Local camera feed"}
      />
      {observation && (
        <svg
          className={`remote-preview-overlay ${RemotePreviewOverlayStyles}`}
          viewBox={`0 0 ${observation.width} ${observation.height}`}
          aria-hidden="true"
        >
          {observation.faceBox && (
            <rect
              {...observation.faceBox}
              fill="none"
              stroke="#a7d7c5"
              strokeWidth="3"
            />
          )}
          {observation.eyes.map((eye, index) => (
            <circle
              key={index}
              cx={eye.center[0]}
              cy={eye.center[1]}
              r={Math.max(eye.radius, 3)}
              fill="none"
              stroke="#a7d7c5"
              strokeWidth="3"
            />
          ))}
          {mode === "ir" && (roi.width !== 1 || roi.height !== 1) && (
            <rect
              x={roi.x * observation.width}
              y={roi.y * observation.height}
              width={roi.width * observation.width}
              height={roi.height * observation.height}
              fill="none"
              stroke="#edd7a4"
              strokeWidth="3"
            />
          )}
        </svg>
      )}
      {mode === "ir" && observation?.eyeRegions && (
        <svg
          className={`remote-preview-overlay ${RemotePreviewOverlayStyles}`}
          viewBox={`0 0 ${observation.width} ${observation.height}`}
          aria-hidden="true"
        >
          {observation.eyeRegions.map((region, index) => (
            <rect
              key={index}
              {...region}
              fill="none"
              stroke="#edd7a4"
              strokeWidth="2"
            />
          ))}
          {observation.glints?.map((point, index) => (
            <circle
              key={index}
              cx={point[0]}
              cy={point[1]}
              r={3}
              fill="#edd7a4"
            />
          ))}
        </svg>
      )}
      {status !== "ready" && (
        <div
          className={`remote-preview-placeholder ${RemotePreviewPlaceholderStyles} ${replaying ? "pointer-events-none" : ""}`}
        >
          {status === "loading" ? (
            <LoaderCircle
              size={30}
              className={`remote-spin ${RemoteSpinStyles}`}
            />
          ) : (
            <Camera size={30} />
          )}
          <span>{status === "loading" ? "Starting…" : "Camera off"}</span>
        </div>
      )}
    </div>
  )
}
