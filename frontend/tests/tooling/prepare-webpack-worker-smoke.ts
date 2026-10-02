import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import type { WorkerDescriptor } from "./prepare-webpack-worker-smoke.types"

const appDirectory = path.resolve(import.meta.dir, "../../apps/web")
const staticDirectory = path.join(appDirectory, ".next/static")
const destination = path.join(appDirectory, ".next/scene-fixture")
const workers: WorkerDescriptor[] = [
  {
    name: "tracker",
    fingerprints: [
      "Could not process this camera frame.",
      "Could not load vision engine.",
    ],
    url: "",
  },
  {
    name: "head",
    fingerprints: [
      "Could not download the face-tracking runtime.",
      "Could not orient the front-camera frame.",
    ],
    url: "",
  },
  {
    name: "remote",
    fingerprints: [
      "IR pupils + face pose / close-up reflection",
      "Tracking model could not load.",
    ],
    url: "",
  },
]
const files = await readdir(staticDirectory, { recursive: true })
const chunks: string[] = []
for (const file of files) {
  if (
    file.endsWith(".js") &&
    (await stat(path.join(staticDirectory, file))).isFile()
  ) {
    chunks.push(file)
  }
}
for (const worker of workers) {
  const matches: string[] = []
  for (const chunk of chunks) {
    const source = await readFile(path.join(staticDirectory, chunk), "utf8")
    if (
      worker.fingerprints.every((fingerprint) => source.includes(fingerprint))
    ) {
      matches.push(chunk)
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      `Expected one compiled ${worker.name} worker; found ${matches.length}: ${matches.join(", ")}`
    )
  }
  const entry = matches[0]
  const chunkId = path.basename(entry).split(".")[0]
  const constructors: string[] = []
  for (const chunk of chunks) {
    const source = await readFile(path.join(staticDirectory, chunk), "utf8")
    const calls = source.match(/new Worker.{0,200}/g) ?? []
    for (const call of calls) {
      if (call.includes(`.u(${chunkId})`)) {
        constructors.push(call)
      }
    }
  }
  if (constructors.length !== 1 || !constructors[0].includes("{type:void 0}")) {
    throw new Error(
      `Expected one classic production constructor for ${worker.name}; inspect emitted options: ${constructors.join("; ")}`
    )
  }
  worker.url = `/_next/static/${entry.split(path.sep).join("/")}`
}
await mkdir(destination, { recursive: true })
// Copy only build-public chunks and repository-public model/runtime assets.
await cp(staticDirectory, path.join(destination, "_next/static"), {
  recursive: true,
})
await cp(path.join(appDirectory, "public"), destination, { recursive: true })
const template = await readFile(
  path.join(import.meta.dir, "webpack-worker-smoke.html"),
  "utf8"
)
const manifest = JSON.stringify(
  Object.fromEntries(workers.map((worker) => [worker.name, worker.url]))
)
const uiBuild = await Bun.build({
  entrypoints: [path.join(import.meta.dir, "webpack-worker-smoke.ts")],
  target: "browser",
  outdir: destination,
  naming: "webpack-worker-smoke.[ext]",
  define: { WORKER_MANIFEST: manifest },
})
if (!uiBuild.success) {
  throw new Error(uiBuild.logs.map(String).join("\n"))
}
await writeFile(path.join(destination, "webpack-worker-smoke.html"), template)
console.log("Next emitted worker entries:")
for (const worker of workers) {
  console.log(`${worker.name}: ${worker.url}`)
}
console.log(
  "Use the scene fixture --serve server; open http://127.0.0.1:4014/webpack-worker-smoke.html"
)
