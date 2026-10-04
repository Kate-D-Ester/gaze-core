import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"

const project = resolve(import.meta.dir, "../../../..")
const engine = process.env.GAZE_SPEAKER_ENGINE ?? "rtfs"
if (engine !== "rtfs" && engine !== "av-mossformer2") {
  throw new Error("GAZE_SPEAKER_ENGINE must be rtfs or av-mossformer2")
}
const uv = Bun.which("uv")
if (!uv) {
  throw new Error("Install uv and run the speaker-service setup first")
}
const temporary = resolve(project, ".cache/tmp")
await mkdir(temporary, { recursive: true })
const environment = {
  ...process.env,
  UV_CACHE_DIR: resolve(project, ".cache/uv"),
  TORCH_EXTENSIONS_DIR: resolve(project, ".cache/torch"),
  TMPDIR: temporary,
}
const service = Bun.spawn(
  [
    uv,
    "run",
    "--frozen",
    "gaze-speaker",
    "--device",
    "auto",
    "--engine",
    engine,
    "--assets",
    engine === "rtfs" ? "data/assets" : "data/av-assets",
    "--origin",
    "http://127.0.0.1:4010",
  ],
  {
    cwd: resolve(project, "speaker-service"),
    env: environment,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }
)
const web = Bun.spawn(
  [process.execPath, "run", "dev", "--hostname", "127.0.0.1", "--port", "4010"],
  {
    cwd: resolve(project, "frontend/apps/web"),
    env: environment,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }
)
const stop = () => {
  web.kill()
  service.kill()
}
process.once("SIGINT", stop)
process.once("SIGTERM", stop)
try {
  process.exitCode = await Promise.race([web.exited, service.exited])
} finally {
  stop()
  await Promise.allSettled([web.exited, service.exited])
  process.removeListener("SIGINT", stop)
  process.removeListener("SIGTERM", stop)
}
