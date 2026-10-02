import { fileURLToPath } from "node:url"
import { startOrReuseCameraRelay } from "./camera-relay"
function developmentServerArguments(nextCli: string) {
  const argumentsList = [
    process.execPath,
    nextCli,
    "dev",
    "--webpack",
    "--port",
    "4001",
  ]
  const certificate = process.env.GAZE_DEV_TLS_CERT
  const privateKey = process.env.GAZE_DEV_TLS_KEY
  if (Boolean(certificate) !== Boolean(privateKey)) {
    throw new Error(
      "Set both GAZE_DEV_TLS_CERT and GAZE_DEV_TLS_KEY for local HTTPS."
    )
  }
  if (certificate && privateKey) {
    argumentsList.push(
      "--experimental-https",
      "--experimental-https-cert",
      certificate,
      "--experimental-https-key",
      privateKey
    )
  }
  return [...argumentsList, ...process.argv.slice(2)]
}
async function runDevelopmentServers() {
  const relay = await startOrReuseCameraRelay()
  try {
    const nextCli = fileURLToPath(
      new URL("../node_modules/next/dist/bin/next", import.meta.url)
    )
    const web = Bun.spawn(developmentServerArguments(nextCli), {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
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
