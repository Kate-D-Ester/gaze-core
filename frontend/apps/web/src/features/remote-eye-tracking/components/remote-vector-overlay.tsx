import type {
  RemoteVectorOverlayProps,
  VectorArrowProps,
} from "./remote-vector-overlay.types"

/** Eyes are enlarged only for display; numeric values remain the measured values. */
export const EYE_VECTOR_DISPLAY_SCALE = 4

function VectorArrow({ origin, delta, color, label }: VectorArrowProps) {
  const length = Math.hypot(...delta)
  const endX = origin[0] + delta[0]
  const endY = origin[1] + delta[1]
  const angle = Math.atan2(delta[1], delta[0])
  const head = Math.min(8, length / 2)
  const firstX = endX - head * Math.cos(angle - Math.PI / 6)
  const firstY = endY - head * Math.sin(angle - Math.PI / 6)
  const secondX = endX - head * Math.cos(angle + Math.PI / 6)
  const secondY = endY - head * Math.sin(angle + Math.PI / 6)
  return (
    <g data-vector={label} stroke={color} strokeWidth="2" fill={color}>
      <title>{label}</title>
      <circle cx={origin[0]} cy={origin[1]} r="2.5" stroke="none" />
      <line x1={origin[0]} y1={origin[1]} x2={endX} y2={endY} />
      {length > 2 && (
        <path
          d={`M ${firstX} ${firstY} L ${endX} ${endY} L ${secondX} ${secondY}`}
          fill="none"
        />
      )}
    </g>
  )
}

export function RemoteVectorOverlay({
  vectors,
  faceWidth,
}: RemoteVectorOverlayProps) {
  const face = vectors.face
  const faceScale = Math.max(20, faceWidth * 0.3)
  return (
    <g>
      {face && (
        <VectorArrow
          origin={face.origin}
          delta={[face.direction[0] * faceScale, face.direction[1] * faceScale]}
          color="#8bd3ed"
          label="Face direction (3D projected into camera image)"
        />
      )}
      {[vectors.rightEye, vectors.leftEye].map((eye) => {
        if (!eye) {
          return null
        }
        return (
          <VectorArrow
            key={eye.side}
            origin={eye.origin}
            delta={[
              (eye.center[0] - eye.origin[0]) * EYE_VECTOR_DISPLAY_SCALE,
              (eye.center[1] - eye.origin[1]) * EYE_VECTOR_DISPLAY_SCALE,
            ]}
            color={eye.side === "right" ? "#ffc078" : "#ff8d9a"}
            label={`${eye.side} eye movement (2D, display ×${EYE_VECTOR_DISPLAY_SCALE})`}
          />
        )
      })}
    </g>
  )
}
