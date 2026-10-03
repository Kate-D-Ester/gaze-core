import { liveReplySchema } from "./live-schema"
import type {
  ReadyReply,
  StreamConfig,
  StreamConnectionOptions,
} from "./stream-connection.types"
export class StreamConnection {
  private socket: WebSocket | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private cleanup: (() => void) | null = null
  private reject: ((reason: unknown) => void) | null = null
  constructor(private readonly options: StreamConnectionOptions) {}
  open(config: StreamConfig, signal: AbortSignal): Promise<ReadyReply> {
    this.close()
    signal.throwIfAborted()
    return new Promise((resolve, reject) => {
      let ready = false
      this.reject = reject
      const socket = (
        this.options.socketFactory ?? ((url) => new WebSocket(url))
      )(this.options.baseUrl.replace("http:", "ws:") + "/live")
      this.socket = socket
      const timer = setTimeout(
        () => fail("Local streaming connection timed out"),
        5000
      )
      const abort = () => this.close()
      this.cleanup = () => {
        clearTimeout(timer)
        signal.removeEventListener("abort", abort)
      }
      signal.addEventListener("abort", abort, { once: true })
      const fail = (message: string) => {
        if (this.socket !== socket) {
          return
        }
        this.close()
        reject(new Error(message))
        this.options.onError(message)
      }
      socket.onopen = () =>
        this.control({
          type: "configure",
          protocol_version: 2,
          sample_rate: 16000,
          audio: true,
          sync_verified: true,
          ...config,
        })
      socket.onmessage = (event) => {
        if (this.socket !== socket || signal.aborted) {
          return
        }
        try {
          if (
            typeof event.data !== "string" ||
            event.data.length > 1024 * 1024
          ) {
            throw new Error("Streaming reply exceeds its size limit")
          }
          const reply = liveReplySchema.parse(JSON.parse(event.data))
          if (reply.type === "ready") {
            if (ready || reply.stride_samples >= reply.window_samples) {
              throw new Error("Invalid streaming profile")
            }
            ready = true
            clearTimeout(timer)
            this.reject = null
            this.heartbeat = setInterval(
              () => this.control({ type: "heartbeat" }),
              2000
            )
            resolve(reply)
          } else if (!ready && reply.type === "error") {
            fail(reply.message)
          } else if (ready) {
            this.options.onReply(reply)
          } else {
            throw new Error("Streaming service did not initialize")
          }
        } catch {
          fail("Local service returned invalid streaming data")
        }
      }
      socket.onerror = () => fail("Local streaming connection failed")
      socket.onclose = () => {
        if (this.socket === socket) {
          fail("Local streaming connection closed; reconnect to listen")
          this.options.onDisconnect?.()
        }
      }
    })
  }
  packet(bytes: ArrayBuffer): boolean {
    if (!this.socket || this.socket.readyState !== 1) {
      return false
    }
    if (this.socket.bufferedAmount + bytes.byteLength > 256000) {
      this.options.onError("Local transport cannot keep up; resume listening")
      return false
    }
    this.socket.send(bytes)
    return true
  }
  select(generation: number, targetId: string | null): void {
    this.control({ type: "target", generation, target_id: targetId })
  }
  control(value: object): void {
    if (this.socket?.readyState === 1) {
      this.socket.send(JSON.stringify(value))
    }
  }
  close(): void {
    this.cleanup?.()
    this.cleanup = null
    this.reject?.(new Error("Streaming connection was cancelled"))
    this.reject = null
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
    const socket = this.socket
    this.socket = null
    if (socket) {
      socket.onopen = null
      socket.onmessage = null
      socket.onclose = null
      socket.onerror = null
      socket.close()
    }
  }
}
