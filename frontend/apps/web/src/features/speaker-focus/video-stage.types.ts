import type { ClipSession } from "./clip-session"
import type { ClipSessionState } from "./clip-session.types"
import type { Box, FaceTrack } from "./client.types"
export type VideoStageProps = { session: ClipSession; state: ClipSessionState }
export type VisibleTarget = { track: FaceTrack; box: Box; number: number }
