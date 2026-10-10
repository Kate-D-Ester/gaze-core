import { cp, mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const researchRoot = import.meta.dirname
const destination = path.join(researchRoot, "models/runtime")
const modulePath = fileURLToPath(import.meta.resolve("onnxruntime-web/wasm"))
const distribution = path.dirname(modulePath)
await mkdir(destination, { recursive: true })
for (const file of [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
]) {
  await cp(path.join(distribution, file), path.join(destination, file))
}
await cp(
  path.join(researchRoot, "models/RUNTIME-LICENSE"),
  path.join(destination, "LICENSE")
)
console.log(
  "Prepared the pinned experimental 3D gaze WASM runtime. Existing trackers are unchanged."
)
