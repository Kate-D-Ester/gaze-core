import { useObjectTracking } from "./use-object-tracking"
import { getViewerGaze } from "./viewer-gaze"
import type { ObjectBox, ObjectRegion } from "./object-tracking.types"
import { ShieldCheck } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { download } from "../scene-eye-tracking/download"
import { useViewerCamera } from "./use-viewer-camera"
import { EyeAppStyles } from "../tracking-ui/layout-styles"
import { TrackingBrand } from "../tracking-ui/tracking-brand"
import { CameraPanel } from "./camera-panel"
import type { ViewerSourceKind } from "./camera-panel.types"
import { CommandBar } from "./command-bar"
import { parseViewerCommand } from "./commands"
import type { CameraRole } from "./commands.types"
import { LocalVoiceController } from "./local-voice"
import { captureCameraPhoto } from "./photo"
import { ViewerSetup } from "./viewer-setup"
import {
  createVisualSelection,
  hasFreshFrame,
  isSelectionCurrent,
  pruneVisualSelections,
} from "./selection"
import type { PreviewPoint } from "./selection.types"
import type {
  ViewerWorkspaceProps,
  ConnectionGuard,
  ViewerCameras,
  ViewerSelections,
} from "./viewer-workspace.types"

const ROLES: readonly CameraRole[] = ["eye", "scene", "auxiliary"]
const LABELS: Record<CameraRole, string> = {
  eye: "Eye camera",
  scene: "Scene camera",
  auxiliary: "Auxiliary camera",
}

export function ViewerWorkspace({
  eyeCamera,
  sceneCamera,
  auxiliaryCamera,
  onSetup,
  setupStatus,
  gazeSession,
  voiceSessionFactory,
  objectTracking,
  visible = true,
}: ViewerWorkspaceProps = {}) {
  const eye = useViewerCamera({
    camera: eyeCamera,
    transformRole: "viewer-eye",
    label: LABELS.eye,
  })
  const scene = useViewerCamera({
    camera: sceneCamera,
    transformRole: "viewer-scene",
    label: LABELS.scene,
  })
  const auxiliary = useViewerCamera({
    camera: auxiliaryCamera,
    transformRole: "viewer-auxiliary",
    label: LABELS.auxiliary,
  })
  const cameras = useMemo<ViewerCameras>(
    () => ({
      eye: eye.camera,
      scene: scene.camera,
      auxiliary: auxiliary.camera,
    }),
    [eye.camera, scene.camera, auxiliary.camera]
  )
  const snapshots = { eye, scene, auxiliary }
  const { tracking, snapshot: tracked } = useObjectTracking(
    scene.camera,
    auxiliary.camera,
    visible,
    objectTracking
  )
  const region = useRef<ObjectRegion | null>(null)
  const [sceneRegion, setSceneRegion] = useState<ObjectRegion | null>(null)
  const [active, setActive] = useState<CameraRole>("scene")
  const activeRole = useRef<CameraRole>("scene")
  const selectCamera = useCallback((role: CameraRole) => {
    activeRole.current = role
    setActive(role)
  }, [])
  const chosenPoints = useRef<ViewerSelections>({})
  const saveSelections = useCallback((next: ViewerSelections) => {
    chosenPoints.current = next
    setSelections(next)
  }, [])
  const [selections, setSelections] = useState<ViewerSelections>({})
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [connectionPending, setConnectionPending] = useState(false)
  const connection = useRef<ConnectionGuard>({
    busy: false,
    generation: 0,
    role: null,
  })
  const [capturing, setCapturing] = useState(false)
  const capturePending = useRef(false)
  const mounted = useRef(false)
  const [clock, setClock] = useState(() => performance.now())
  const [voice] = useState(() => new LocalVoiceController(voiceSessionFactory))
  const voiceState = useSyncExternalStore(voice.subscribe, voice.getSnapshot)

  useEffect(() => {
    if (!visible) {
      voice.stop()
    }
  }, [visible, voice])
  useEffect(() => {
    mounted.current = true
    voice.mount()
    const hidden = () => {
      if (document.hidden) {
        voice.stop()
      }
    }
    document.addEventListener("visibilitychange", hidden)
    const guard = connection.current
    const timer = setInterval(() => {
      const now = performance.now()
      setClock(now)
      const retained = pruneVisualSelections(
        chosenPoints.current,
        {
          eye: cameras.eye.getSnapshot(),
          scene: cameras.scene.getSnapshot(),
          auxiliary: cameras.auxiliary.getSnapshot(),
        },
        now
      )
      if (retained !== chosenPoints.current) {
        saveSelections(retained)
      }
    }, 250)
    return () => {
      mounted.current = false
      guard.generation++
      guard.busy = false
      clearInterval(timer)
      document.removeEventListener("visibilitychange", hidden)
      voice.dispose()
    }
  }, [cameras, saveSelections, voice])

  const selectPoint = useCallback(
    (role: CameraRole, point: PreviewPoint) => {
      const selection = createVisualSelection(
        point,
        cameras[role].getSnapshot(),
        performance.now()
      )
      if (!selection) {
        setError(
          "Connect a camera and wait for a fresh frame before selecting a point."
        )
        return
      }
      if (role === "scene") {
        region.current = null
        setSceneRegion(null)
      }
      selectCamera(role)
      saveSelections({ ...chosenPoints.current, [role]: selection })
      setError("")
      setNotice(`${LABELS[role]}: static point selected.`)
    },
    [cameras, saveSelections, selectCamera]
  )

  const selectRegion = useCallback(
    (box: ObjectBox) => {
      selectPoint("scene", [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2])
      const chosen = chosenPoints.current.scene
      if (chosen) {
        region.current = {
          box,
          sourceKey: chosen.sourceKey,
          generation: chosen.generation,
        }
        setSceneRegion(region.current)
        setNotice("Object rectangle chosen. Press Select.")
      }
    },
    [selectPoint]
  )

  const execute = useCallback(
    async (text: string) => {
      const command = parseViewerCommand(text)
      if (!command) {
        setError(
          "Unknown command. Use select, clear, switch camera, take photo, or a camera name."
        )
        return
      }
      const role = activeRole.current
      setError("")
      if (command.kind === "camera") {
        selectCamera(command.role)
        setNotice(`${LABELS[command.role]} is active.`)
        return
      }
      if (command.kind === "next-camera") {
        const next = ROLES[(ROLES.indexOf(role) + 1) % ROLES.length]!
        selectCamera(next)
        setNotice(`${LABELS[next]} is active.`)
        return
      }
      if (command.kind === "select") {
        let selected = chosenPoints.current[role] ?? null
        if (role === "scene" && !selected && gazeSession) {
          const gaze = getViewerGaze(
            gazeSession.getSnapshot(),
            cameras.scene.getSnapshot(),
            performance.now()
          )
          if (gaze.point) {
            selected = createVisualSelection(
              gaze.point,
              cameras.scene.getSnapshot(),
              performance.now()
            )
          }
        }
        const current = isSelectionCurrent(
          selected,
          cameras[role].getSnapshot(),
          performance.now()
        )
        if (!hasFreshFrame(cameras[role].getSnapshot(), performance.now())) {
          setError(
            "Connect a camera and wait for a fresh frame before selecting a point."
          )
        } else if (!current) {
          setError(
            `Click a point in the ${LABELS[role].toLowerCase()} preview first.`
          )
        } else if (role === "scene") {
          const area = region.current
          const usable =
            area &&
            area.sourceKey === selected!.sourceKey &&
            area.generation === selected!.generation
          setNotice("Selecting object…")
          await tracking.select(
            cameras.scene,
            usable ? { box: area.box } : { point: selected!.point }
          )
          const state = tracking.getSnapshot()
          if (mounted.current) {
            if (state.error) {
              setError(state.error)
            } else {
              setNotice(
                state.reference
                  ? `${state.reference.label}: reference selected.`
                  : "Selection cleared."
              )
            }
          }
        } else {
          setNotice(`${LABELS[role]}: manual point confirmed.`)
        }
        return
      }
      if (command.kind === "clear") {
        tracking.clear()
        region.current = null
        setSceneRegion(null)
        saveSelections({ ...chosenPoints.current, [role]: undefined })
        setNotice(`${LABELS[role]} selection cleared.`)
        return
      }
      if (command.kind === "voice-stop") {
        voice.stop()
        return
      }
      if (command.kind === "stop") {
        tracking.clear()
        region.current = null
        setSceneRegion(null)
        connection.current.generation++
        connection.current.busy = false
        setConnectionPending(false)
        ROLES.forEach((role) => cameras[role].stop())
        voice.stop()
        saveSelections({})
        setNotice("All cameras disconnected.")
        return
      }
      if (capturePending.current) {
        return
      }
      capturePending.current = true
      setCapturing(true)
      try {
        const photo = await captureCameraPhoto(cameras[role])
        if (mounted.current) {
          download(photo, `gazecore-${role}-${Date.now()}.png`)
          setNotice(`${LABELS[role]} photo saved.`)
        }
      } catch (failure) {
        if (mounted.current) {
          setError(
            failure instanceof Error
              ? failure.message
              : "The photo could not be saved."
          )
        }
      } finally {
        capturePending.current = false
        if (mounted.current) {
          setCapturing(false)
        }
      }
    },
    [cameras, gazeSession, saveSelections, selectCamera, tracking, voice]
  )

  async function connect(
    role: CameraRole,
    kind: ViewerSourceKind,
    value: string
  ) {
    if (connection.current.busy) {
      return
    }
    connection.current.busy = true
    connection.current.role = role
    const generation = ++connection.current.generation
    setConnectionPending(true)
    setError("")
    if (role === "scene") {
      tracking.clear()
      region.current = null
      setSceneRegion(null)
    }
    saveSelections({ ...chosenPoints.current, [role]: undefined })
    try {
      if (kind === "network") {
        await cameras[role].startNetworkStream(value)
      } else {
        const excluded = ROLES.filter((other) => other !== role).flatMap(
          (other) => {
            const id = cameras[other].getSnapshot().source?.deviceId
            return id ? [id] : []
          }
        )
        await cameras[role].startCamera(value, excluded)
      }
    } finally {
      if (generation === connection.current.generation && mounted.current) {
        connection.current.busy = false
        setConnectionPending(false)
      }
    }
  }
  function disconnect(role: CameraRole) {
    if (role === "scene") {
      tracking.clear()
      region.current = null
      setSceneRegion(null)
    }
    cameras[role].stop()
    if (connection.current.role === role) {
      connection.current.generation++
      connection.current.busy = false
      connection.current.role = null
      setConnectionPending(false)
    }
    saveSelections({ ...chosenPoints.current, [role]: undefined })
  }
  const activeState = snapshots[active]
  const displayTime = Math.max(clock, activeState.frame?.timestamp ?? 0)
  return (
    <div
      className={`fixed inset-0 ${EyeAppStyles}`}
      style={{ overflow: "clip" }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-4 md:px-8">
        <TrackingBrand version="VIEWER" />
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck size={16} aria-hidden="true" />
          Local camera viewer
        </span>
      </header>
      <main className="min-h-0 flex-1 [scroll-padding-top:calc(var(--viewer-command-height,0px)+16px)] overflow-auto">
        <div className="mx-auto max-w-400 space-y-4 p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight">
              Three-camera viewer
            </h1>
            <ViewerSetup
              onSetup={onSetup}
              status={setupStatus}
              disabled={
                connectionPending || ROLES.some((role) => snapshots[role].busy)
              }
            />
          </div>
          <CommandBar
            activeLabel={LABELS[active]}
            canCapture={hasFreshFrame(activeState, displayTime)}
            capturing={capturing}
            voice={voiceState}
            feedback={error || notice}
            commandError={!!error}
            onCommand={(text) => {
              void execute(text)
            }}
            onVoiceStart={() => {
              void voice.start((text) => {
                void execute(text)
              })
            }}
            onVoiceStop={() => voice.stop()}
          />
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ROLES.map((role) => {
              const state = snapshots[role]
              const selection = selections[role] ?? null
              const valid = isSelectionCurrent(
                selection,
                state,
                Math.max(clock, state.frame?.timestamp ?? 0)
              )
              const excluded = ROLES.filter((other) => other !== role).flatMap(
                (other) =>
                  snapshots[other].source?.deviceId
                    ? [snapshots[other].source!.deviceId!]
                    : []
              )
              return (
                <CameraPanel
                  key={role}
                  now={clock}
                  role={role}
                  label={LABELS[role]}
                  camera={cameras[role]}
                  state={state}
                  active={active === role}
                  connectionPending={connectionPending}
                  excludedDevices={excluded}
                  selection={valid ? selection : null}
                  gazeSession={role === "scene" ? gazeSession : undefined}
                  tracking={role === "eye" ? undefined : tracked}
                  region={
                    role === "scene" &&
                    sceneRegion &&
                    sceneRegion.sourceKey === state.source?.key &&
                    sceneRegion.generation === state.frame?.generation
                      ? sceneRegion.box
                      : null
                  }
                  onRegion={role === "scene" ? selectRegion : undefined}
                  onActivate={() => selectCamera(role)}
                  onConnect={(kind, value) => {
                    void connect(role, kind, value)
                  }}
                  onDisconnect={() => disconnect(role)}
                  onPoint={(point) => selectPoint(role, point)}
                />
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
