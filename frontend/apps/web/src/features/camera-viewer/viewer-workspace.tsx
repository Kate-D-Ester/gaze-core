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
  const [voice] = useState(() => new LocalVoiceController())
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
      selectCamera(role)
      saveSelections({ ...chosenPoints.current, [role]: selection })
      setError("")
      setNotice(`${LABELS[role]}: static point selected.`)
    },
    [cameras, saveSelections, selectCamera]
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
        const selected = chosenPoints.current[role] ?? null
        const current = isSelectionCurrent(
          selected,
          cameras[role].getSnapshot(),
          performance.now()
        )
        selectPoint(role, current ? selected!.point : [0.5, 0.5])
        return
      }
      if (command.kind === "clear") {
        saveSelections({ ...chosenPoints.current, [role]: undefined })
        setNotice(`${LABELS[role]} selection cleared.`)
        return
      }
      if (command.kind === "voice-stop") {
        voice.stop()
        return
      }
      if (command.kind === "stop") {
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
    [cameras, saveSelections, selectCamera, selectPoint, voice]
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
    <div className={`fixed inset-0 ${EyeAppStyles}`} style={{ overflow: "clip" }}>
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
          {(error || notice) && (
            <p
              role={error ? "alert" : "status"}
              aria-live="polite"
              className={`text-xs ${error ? "rounded-md border border-red-300/30 bg-red-300/5 px-3 py-2 text-red-200" : "text-muted-foreground"}`}
            >
              {error || notice}
            </p>
          )}
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
