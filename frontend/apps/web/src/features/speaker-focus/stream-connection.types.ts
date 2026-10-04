import type { z } from "zod"
import type { liveReplySchema } from "./live-schema"
export type StreamReply = z.infer<typeof liveReplySchema>
export type ReadyReply = Extract<StreamReply, { type: "ready" }>
export type StreamConfig = {
  source: "camera" | "network" | "replay"
  video_offset_ms: number
  client_time: number
}
export type StreamConnectionOptions = {
  baseUrl: string
  socketFactory?: (url: string) => WebSocket
  onReply: (reply: StreamReply) => void
  onError: (message: string) => void
  onDisconnect?: () => void
}
