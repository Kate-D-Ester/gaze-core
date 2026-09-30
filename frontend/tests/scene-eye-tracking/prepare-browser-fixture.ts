import { writeFile } from "node:fs/promises"
import path from "node:path"
// Build only into ignored dist after the production build. Rebuild removes the fixture.
const destination = path.resolve(import.meta.dir, "../../apps/web/dist")
const result = await Bun.build({
  entrypoints: [
    path.resolve(
      import.meta.dir,
      "../../apps/web/scripts/scene-browser-fixture.tsx"
    ),
  ],
  target: "browser",
  outdir: destination,
  naming: "scene-fixture.[ext]",
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
})
if (!result.success) throw new Error(result.logs.map(String).join("\n"))
await writeFile(
  path.join(destination, "scene-fixture.html"),
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scene-camera test fixture</title><link rel="stylesheet" href="/scene-fixture.css"></head><body style="margin:0;background:#14161b;color:#f3f4f6;font-family:system-ui"><div id="root"></div><script type="module" src="/scene-fixture.js"></script></body></html>'
)
console.log("Fixture: http://127.0.0.1:4014/scene-fixture.html")
