import type { PointerEventHandler, RefObject } from "react"
import type {
  RemoteMode,
  RemoteObservation,
  Rect,
} from "../remote-eye-tracking.types"
import type { SessionState } from "../session.types"
export type RemoteCameraPreviewProps = {
  observation: RemoteObservation | null
  showVectors?: boolean
  mode: RemoteMode | null
  roi: Rect
  replaying: boolean
  selecting: boolean
  status: SessionState["status"]
  videoRef: RefObject<HTMLVideoElement | null>
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerUp: PointerEventHandler<HTMLDivElement>
}
