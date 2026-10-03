import { SceneSourceControls } from "../scene-eye-tracking/scene-controls"
import { useSceneCamera } from "../scene-eye-tracking/use-scene-camera"
import { LiveSpeakerPanel } from "./live-panel"
const connected = () => {}
export function StandaloneLive() {
  const scene = useSceneCamera()
  return (
    <details className="rounded-xl border p-5">
      <summary className="cursor-pointer font-medium">
        Live camera and microphone
      </summary>
      <div className="mt-4">
        <SceneSourceControls
          camera={scene.camera}
          state={scene}
          onConnected={connected}
        />
        <LiveSpeakerPanel
          camera={scene.camera}
          source={scene.source}
          frame={scene.frame}
          measurement={null}
          verified={false}
          identity={JSON.stringify([scene.source?.key, scene.transform])}
        />
      </div>
    </details>
  )
}
