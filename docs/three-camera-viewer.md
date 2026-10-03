# Three-camera viewer

This public trial previews Eye, Scene, and Auxiliary camera feeds independently. It provides static image markers and manual PNG photos. The Eye panel is a video preview; gaze estimation/calibration remains in the existing scene-camera trial. Static selection does not identify, track, or match an object across cameras.

## Run

From this worktree's `frontend` folder:

```sh
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:4001/trial/three-camera-viewer`, or choose Three-camera viewer on the dashboard. The separate auth backend is not needed for this public route. Camera access requires localhost or HTTPS and browser camera permission.

Choose USB or Network separately in each panel and press Connect. Use three distinct USB devices. The default-camera option may select an already connected device; choose an explicit available device if that happens. USB connection attempts are serialized to prevent duplicate allocation. Disconnect affects only its feed; stop cameras disconnects all three.

Network feeds use the existing local relay on port 4022, started by the development command. The relay supports the stream formats already supported by GazeCore, including local MJPEG and browser-readable video. Unsupported codecs/transports need conversion outside this viewer. RTSP URLs do not play directly in a browser. Network URLs remain in component memory and are not saved as preferences.

Rotate, enter a rotation angle, mirror horizontally, flip vertically, or reset each feed independently. Orientation preferences are stored locally under separate viewer keys and do not alter existing tracking orientation.

## Commands

Click a camera's heading to make it active. Click its preview to pin a static image point, or focus the preview and press Enter/Space to choose its center. The marker stays at that image position and clears from view after reconnecting, changing orientation, or losing fresh frames.

Typed commands and buttons work in supported modern browsers:

- `select` / `select it`: keep the active marker, or select the preview center.
- `clear` / `clear selection`: remove the active marker.
- `switch camera`: cycle Eye → Scene → Auxiliary.
- `eye camera`, `scene camera`, `auxiliary camera`: choose a feed.
- `take photo` / `take a photo`: download one PNG from the active fresh transformed frame.
- `stop cameras` / `stop all cameras`: disconnect all feeds and stop voice.
- `stop voice`: turn off microphone recognition.

Phrases must match a whole command. Unknown input does nothing and displays help. Photos contain the camera image in the chosen orientation, without UI markers or coordinate metadata. There is no automatic photo capture.

## Local voice and privacy

Enable local voice explicitly. This uses English (`en-US`) browser [on-device speech recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally), requires an installed local language pack, and sets `processLocally = true`. Voice is experimental and browser-dependent. If unavailable, use the same commands in the text field. The app never falls back to remote speech recognition.

When offered, Download speech pack asks the browser to download its English language model; this does not start the microphone. Enable voice afterward. Microphone permission is still required. Voice stops on errors, page hiding, browser recognition ending, stop cameras, and leaving the viewer. A browser ending recognition after silence requires Enable local voice again.

Frames, photos, transcripts, commands, and the supplied reference video are not uploaded by this feature. Source URLs are not logged or saved. Only orientation settings persist. The viewer does not contain object acquisition/tracking, cross-camera matching, hardware-control output, or firing commands.

## Verification on this branch

676 frontend tests, lint, typecheck, production build, and `bun audit` passed. The public production route was inspected at 1280px and 390px CSS widths and tested for command switching, source controls, transform independence and disconnected-frame rejection. Camera/microphone APIs were exercised with controlled platform fixtures in tests; live validation with three physical cameras and a microphone remains outstanding.

The inherited global `brace-expansion` v5 override was removed because `minimatch` v3 expects the v1 callable API. The lockfile now resolves compatible patched versions and passes the dependency audit. If an existing install retains the incompatible dependency symlink, run `bun install --force --frozen-lockfile` once.
