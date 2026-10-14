import type { FollowSnapshot } from "./target-follower.types"
import { sameSource, validObjectBox } from "../camera-viewer/object-tracking"
import type { ObjectTracking } from "../camera-viewer/object-tracking"
import type {
  FrameContext,
  ObjectMatch,
} from "../camera-viewer/object-tracking.types"
import type { ViewerCamera } from "../camera-viewer/viewer-camera.types"
import { hasFreshFrame } from "../camera-viewer/selection"
import { transformKey } from "../camera-viewer/object-tracking"
import { VisualServo } from "./visual-servo"
import type {
  FollowSettings,
  MotionSession,
  Movement,
} from "./robot-control.types"

const empty = (): FollowSnapshot => ({
  enabled: false,
  phase: "off",
  command: "",
  error: "",
})
const labels: Record<Movement["cmd"], string> = {
  L: "Left",
  R: "Right",
}

/** Validates observation age independently of model inference and renews bounded movement. */
export class TargetFollower {
  private snapshot = empty()
  private listeners = new Set<() => void>()
  private servo: VisualServo | null = null
  private token = ""
  private authority = ""
  private targetContext: FrameContext | null = null
  private confirmationStamp = -Infinity
  private confirmations = 0
  private lastCommand: Movement | null = null
  private lastSent = -Infinity
  private publishing = false
  private version = 0
  constructor(
    private readonly session: MotionSession,
    private readonly tracking: ObjectTracking,
    private readonly scene: ViewerCamera,
    private readonly target: ViewerCamera,
    private readonly now: () => number = () => performance.now()
  ) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private publish(snapshot: FollowSnapshot) {
    if (JSON.stringify(snapshot) === JSON.stringify(this.snapshot)) {
      return
    }
    this.snapshot = snapshot
    this.listeners.forEach((fn) => fn())
  }
  enable(settings: FollowSettings) {
    this.disable()
    if (!this.session.getSnapshot().canControl) {
      throw new Error("Connect MQTT before following.")
    }
    const reference = this.tracking.getSnapshot().reference
    const state = this.target.getSnapshot()
    if (!reference) {
      throw new Error("Select an object in Scene first.")
    }
    if (!hasFreshFrame(state, this.now())) {
      throw new Error("Connect the Target camera before following.")
    }
    this.servo = new VisualServo({ ...settings })
    this.token = reference.token
    this.confirmationStamp =
      this.tracking.getSnapshot().match?.timestamp ?? -Infinity
    this.authority = this.session.getSnapshot().authority
    this.targetContext = {
      sourceKey: state.source!.key,
      transformKey: transformKey(state),
      generation: state.frame!.generation,
      timestamp: state.frame!.timestamp,
    }
    this.publish({ enabled: true, phase: "waiting", command: "", error: "" })
    this.tick()
  }
  disable(error = "") {
    this.version++
    this.servo?.reset()
    this.confirmations = 0
    this.confirmationStamp = -Infinity
    this.lastSent = -Infinity
    this.lastCommand = null
    this.session.cancelMotion()
    void this.session.stop()
    this.publish({ ...empty(), phase: error ? "error" : "off", error })
  }
  private evidence(): ObjectMatch | null {
    const tracking = this.tracking.getSnapshot()
    const state = this.target.getSnapshot()
    const now = this.now()
    const match = tracking.match
    if (
      tracking.status !== "matched" ||
      !match ||
      !validObjectBox(match.box) ||
      !Number.isFinite(match.score) ||
      match.score <= 0.8 ||
      match.score > 1 ||
      !hasFreshFrame(state, now) ||
      now - state.frame!.timestamp > 500 ||
      !sameSource(match, state) ||
      !Number.isFinite(match.timestamp) ||
      now < match.timestamp ||
      now - match.timestamp > 500
    ) {
      return null
    }
    return match
  }
  private halt(resetServo = true) {
    if (this.lastCommand) {
      this.version++
      this.session.cancelMotion()
      void this.session.stop()
    }
    this.lastCommand = null
    this.lastSent = -Infinity
    if (resetServo) {
      this.servo?.reset()
    }
  }
  tick() {
    if (!this.snapshot.enabled) {
      return
    }
    const reference = this.tracking.getSnapshot().reference
    const state = this.target.getSnapshot()
    const robot = this.session.getSnapshot()
    if (!robot.canControl || robot.authority !== this.authority) {
      this.disable("MQTT connection changed. Connect and Follow again.")
      return
    }
    if (
      !reference ||
      reference.token !== this.token ||
      !sameSource(reference, this.scene.getSnapshot())
    ) {
      this.disable()
      return
    }
    if (!this.targetContext || !sameSource(this.targetContext, state)) {
      this.disable(
        "Target camera changed. Check its orientation and Follow again."
      )
      return
    }
    const match = this.evidence()
    if (!match) {
      this.halt()
      this.confirmations = 0
      this.confirmationStamp = -Infinity
      this.publish({ enabled: true, phase: "waiting", command: "", error: "" })
      return
    }
    if (match.timestamp !== this.confirmationStamp) {
      this.confirmations++
      this.confirmationStamp = match.timestamp
    }
    if (this.confirmations < 2) {
      this.publish({ enabled: true, phase: "waiting", command: "", error: "" })
      return
    }
    const movement = this.servo!.decide(
      match.box,
      state.transform,
      match.timestamp
    )
    if (!movement) {
      this.halt(false)
      this.publish({ enabled: true, phase: "holding", command: "", error: "" })
      return
    }
    const changed =
      this.lastCommand?.cmd !== movement.cmd ||
      this.lastCommand?.action !== movement.action
    if (changed) {
      this.version++
      this.session.cancelMotion()
      void this.session.stop()
      this.lastSent = -Infinity
    }
    this.lastCommand = movement
    this.publish({
      enabled: true,
      phase: "moving",
      command: `${labels[movement.cmd]} ${movement.speed}%`,
      error: "",
    })
    if (this.publishing || this.now() - this.lastSent < 250) {
      return
    }
    const version = this.version
    const stamp = match.timestamp
    const guard = () => {
      const reference = this.tracking.getSnapshot().reference
      return (
        this.snapshot.enabled &&
        this.version === version &&
        this.session.getSnapshot().canControl &&
        this.session.getSnapshot().authority === this.authority &&
        !!reference &&
        reference.token === this.token &&
        sameSource(reference, this.scene.getSnapshot()) &&
        !!this.targetContext &&
        sameSource(this.targetContext, this.target.getSnapshot()) &&
        this.evidence()?.timestamp === stamp
      )
    }
    this.publishing = true
    this.lastSent = this.now()
    void this.session
      .move(movement.action, movement.cmd, movement.speed, guard)
      .catch(() => {
        if (this.version === version && this.snapshot.enabled) {
          if (!guard()) {
            this.lastSent = -Infinity
            this.tick()
          } else {
            this.disable("Bot command failed. Check MQTT and Follow again.")
          }
        }
      })
      .finally(() => {
        this.publishing = false
      })
  }
}
