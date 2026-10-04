import { cp, mkdir } from "node:fs/promises"
import path from "node:path"
const root = path.resolve(import.meta.dir, "..")
const destination = path.join(root, "public/vision-runtime")
const packageRoot = path.dirname(
  require.resolve("@mediapipe/tasks-vision/package.json")
)
await mkdir(destination, { recursive: true })
await cp(path.join(packageRoot, "wasm"), path.join(destination, "wasm"), {
  recursive: true,
})
await cp(
  path.join(root, "public/models/LICENSE"),
  path.join(destination, "LICENSE")
)
const result = await Bun.build({
  entrypoints: [
    path.join(root, "src/features/scene-eye-tracking/hand.worker.ts"),
    path.join(root, "src/features/speaker-focus/audio-capture.worklet.ts"),
    path.join(root, "src/features/speaker-focus/scene-face.worker.ts"),
  ],
  target: "browser",
  format: "iife",
  minify: true,
  outdir: destination,
  naming: "[name].js",
})
if (!result.success) {
  throw new Error(result.logs.map(String).join("\n"))
}
await cp(
  path.join(destination, "hand.worker.js"),
  path.join(destination, "scene-hand.worker.js")
)
console.log("Prepared pinned MediaPipe worker and WASM assets.")
