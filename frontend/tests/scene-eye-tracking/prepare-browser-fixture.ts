import { copyFile, cp, mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

// Standalone synthetic fixture under ignored Next output; production routes stay unchanged.
const appDirectory = path.resolve(import.meta.dir, "../../apps/web")
const staticDirectory = path.join(appDirectory, ".next/static")
const destination = path.join(appDirectory, ".next/scene-fixture")
const staticAssets = await readdir(staticDirectory, { recursive: true })
const stylesheets = staticAssets.filter((asset) => asset.endsWith(".css"))
if (stylesheets.length === 0) {
  throw new Error("Build the Next app before preparing the scene fixture.")
}
await mkdir(destination, { recursive: true })
await cp(path.join(appDirectory, "public"), destination, { recursive: true })
const stylesheetLinks: string[] = []
for (const [index, stylesheet] of stylesheets.entries()) {
  const name = `app-${index}.css`
  await copyFile(
    path.join(staticDirectory, stylesheet),
    path.join(destination, name)
  )
  stylesheetLinks.push(`<link rel="stylesheet" href="/${name}">`)
}

const workerResult = await Bun.build({
  entrypoints: [
    path.join(appDirectory, "src/features/scene-eye-tracking/marker.worker.ts"),
  ],
  target: "browser",
  outdir: destination,
  naming: "marker.worker.[ext]",
  minify: true,
})
if (!workerResult.success) {
  throw new Error(workerResult.logs.map(String).join("\n"))
}
const fixtureResult = await Bun.build({
  entrypoints: [path.join(appDirectory, "scripts/scene-browser-fixture.tsx")],
  target: "browser",
  outdir: destination,
  naming: "scene-fixture.[ext]",
  define: {
    "process.env.NODE_ENV": '"production"',
    SCENE_MARKER_WORKER_URL: JSON.stringify("/marker.worker.js"),
  },
  minify: true,
})
if (!fixtureResult.success) {
  throw new Error(fixtureResult.logs.map(String).join("\n"))
}
await writeFile(
  path.join(destination, "scene-fixture.html"),
  `<!doctype html><html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scene-camera test fixture</title>${stylesheetLinks.join("")}</head><body class="m-0 bg-background text-foreground font-sans"><div id="root"></div><script type="module" src="/scene-fixture.js"></script></body></html>`
)
console.log(
  `Serve ${destination} on port 4014; open http://127.0.0.1:4014/scene-fixture.html`
)

if (process.argv.includes("--serve")) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 4014,
    async fetch(request) {
      const pathname = new URL(request.url).pathname
      const filePath = path.resolve(destination, `.${pathname}`)
      if (!filePath.startsWith(destination + path.sep)) {
        return new Response("Not found", { status: 404 })
      }
      const file = Bun.file(filePath)
      if (!(await file.exists())) {
        return new Response("Not found", { status: 404 })
      }
      return new Response(file)
    },
  })
  console.log(`Synthetic fixture server: ${server.url}scene-fixture.html`)
}
