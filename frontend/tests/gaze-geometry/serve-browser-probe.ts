import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const frontendRoot = path.resolve(import.meta.dir, "../..")
const bundleDirectory = await mkdtemp(
  path.join(tmpdir(), "gazecore-gaze-probe-")
)
const assets = path.join(frontendRoot, "research/gaze-3d/models")
const bundle = await Bun.build({
  entrypoints: [path.join(import.meta.dir, "browser-probe.ts")],
  target: "browser",
  format: "esm",
  outdir: bundleDirectory,
})
if (!bundle.success) {
  await rm(bundleDirectory, { recursive: true, force: true })
  throw new Error(bundle.logs.map(String).join("\n"))
}
const files = new Map([
  ["/probe.js", path.join(bundleDirectory, "browser-probe.js")],
  ["/models/gaze-3d-prototype/model.onnx", path.join(assets, "model.onnx")],
  [
    "/models/gaze-3d-prototype/runtime/ort-wasm-simd-threaded.mjs",
    path.join(assets, "runtime/ort-wasm-simd-threaded.mjs"),
  ],
  [
    "/models/gaze-3d-prototype/runtime/ort-wasm-simd-threaded.wasm",
    path.join(assets, "runtime/ort-wasm-simd-threaded.wasm"),
  ],
])

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 4057,
  fetch(request) {
    const pathname = new URL(request.url).pathname
    if (pathname === "/") {
      return new Response(
        '<!doctype html><html><body><p>Local synthetic gaze probe.</p><script type="module" src="/probe.js"></script></body></html>',
        { headers: { "Content-Type": "text/html" } }
      )
    }
    const filename = files.get(pathname)
    if (!filename) {
      return new Response("Not found", { status: 404 })
    }
    let contentType = "application/octet-stream"
    if (pathname.endsWith(".js") || pathname.endsWith(".mjs")) {
      contentType = "text/javascript"
    } else if (pathname.endsWith(".wasm")) {
      contentType = "application/wasm"
    }
    return new Response(Bun.file(filename), {
      headers: { "Content-Type": contentType },
    })
  },
})

async function closeProbe() {
  server.stop(true)
  await rm(bundleDirectory, { recursive: true, force: true })
  process.exit(0)
}
process.once("SIGINT", closeProbe)
process.once("SIGTERM", closeProbe)
console.log(`Synthetic gaze probe at ${server.url}`)
