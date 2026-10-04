import path from "node:path"
import { mkdir } from "node:fs/promises"
const appUrl = process.env.GAZE_TEST_VIEWER_URL ?? "http://127.0.0.1:4014"
async function decodedResponse(response: Response) {
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") ?? "application/octet-stream",
    },
  })
}
const root = path.resolve(import.meta.dir, "../../..")
const cache = path.join(root, ".local-reference")
await mkdir(path.join(cache, "voice"), { recursive: true })
const speechFile = path.join(cache, "voice/select.wav")
if (!(await Bun.file(speechFile).exists()) && process.platform === "darwin") {
  for (const args of [
    ["/usr/bin/say", "-o", path.join(cache, "voice/select.aiff"), "select"],
    [
      "/usr/bin/afconvert",
      "-f",
      "WAVE",
      "-d",
      "LEI16@16000",
      "-c",
      "1",
      path.join(cache, "voice/select.aiff"),
      speechFile,
    ],
  ]) {
    const child = Bun.spawn(args, { stdout: "ignore", stderr: "inherit" })
    if (await child.exited)
      throw new Error("Synthetic speech preparation failed")
  }
}
const publicRoot = path.join(root, "frontend/apps/web/public")
const result = await Bun.build({
  entrypoints: [
    path.join(root, "frontend/tests/camera-viewer/browser-smoke.tsx"),
  ],
  outdir: cache,
  naming: "voice-smoke.js",
  target: "browser",
  format: "esm",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
})
if (!result.success) throw new Error(result.logs.map(String).join("\n"))
const page = await (await fetch(appUrl + "/trial/three-camera-viewer")).text()
const styles = [...page.matchAll(/href="([^"]+\.css[^"]*)"/g)]
  .map((match) => '<link rel="stylesheet" href="' + match[1] + '">')
  .join("")
const html =
  '<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
  styles +
  '</head><body><details style="position:fixed;right:12px;bottom:12px;z-index:100;background:#17211d;padding:8px;border:1px solid #496;max-width:300px;font:12px sans-serif;color:white"><summary>Synthetic test feeds</summary><span>Voice uses generated “select”</span><br><button id="pause-gaze">Pause gaze</button> · <button id="drop-frames">Drop frames</button><button id="public-object">Public object views</button> · <button id="blank-auxiliary">Blank third feed</button><p id="feed-result">Starting feeds</p><p id="voice-result">Ready</p></details><div id="viewer"></div><script type="module" src="/voice-smoke.js"></script></body></html>'
Bun.serve({
  hostname: "127.0.0.1",
  port: 4030,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === "/")
      return new Response(html, { headers: { "Content-Type": "text/html" } })
    if (url.pathname === "/voice-smoke.js")
      return new Response(Bun.file(path.join(cache, "voice-smoke.js")))
    if (url.pathname === "/api/viewer-vision" && request.method === "POST") {
      const response = await fetch(appUrl + "/api/viewer-vision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: appUrl,
        },
        body: await request.text(),
      })
      return decodedResponse(response)
    }
    if (url.pathname === "/public-bus.jpg") {
      return new Response(
        Bun.file(
          path.join(
            root,
            "vision/.venv/lib/python3.12/site-packages/ultralytics/assets/bus.jpg"
          )
        )
      )
    }
    if (url.pathname === "/select.wav")
      return new Response(Bun.file(path.join(cache, "voice/select.wav")))
    if (url.pathname.startsWith("/_next/static/")) {
      return decodedResponse(await fetch(appUrl + url.pathname))
    }
    if (
      [
        "vosk.worker.js",
        "vosk.wasm",
        "english-0.15.tar.gz",
        "microphone.worklet.js",
      ].some((file) => url.pathname === "/voice-runtime/" + file)
    )
      return new Response(Bun.file(path.join(publicRoot, url.pathname)))
    return new Response("Not found", { status: 404 })
  },
})
console.log("Synthetic camera and local voice fixture: http://127.0.0.1:4030")
