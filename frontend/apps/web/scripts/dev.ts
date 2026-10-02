import { fileURLToPath } from "node:url"
import { startOrReuseCameraRelay } from "./camera-relay"

async function runDevelopmentServers() {
  const relay = await startOrReuseCameraRelay()
  try {
    const viteCli = fileURLToPath(
      new URL("../node_modules/vite/bin/vite.js", import.meta.url)
    )
    const web = Bun.spawn(
      [process.execPath, viteCli, ...process.argv.slice(2)],
      {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      }
    )
    const stopWeb = () => web.kill()
    process.once("SIGINT", stopWeb)
    process.once("SIGTERM", stopWeb)
    process.once("exit", stopWeb)
    try {
      process.exitCode = await web.exited
    } finally {
      process.removeListener("SIGINT", stopWeb)
      process.removeListener("SIGTERM", stopWeb)
      process.removeListener("exit", stopWeb)
    }
  } finally {
    // A separately started relay belongs to its caller and stays running.
    await relay?.stop(true)
  }
}

await runDevelopmentServers()
