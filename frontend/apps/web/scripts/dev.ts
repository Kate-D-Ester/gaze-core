import { fileURLToPath } from "node:url"

export function applicationServerArguments(
  nextCli: string,
  command: string,
  extraArguments: string[]
) {
  const argumentsList = [process.execPath, nextCli, command]
  if (command === "dev") {
    argumentsList.push("--webpack")
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
  }
  argumentsList.push("--port", "4001", ...extraArguments)
  return argumentsList
}

async function runApplicationServer() {
  let command = "dev"
  let extraArguments = process.argv.slice(2)
  if (extraArguments[0] === "start") {
    command = "start"
    extraArguments = extraArguments.slice(1)
  }
  const nextCli = fileURLToPath(
    new URL("../node_modules/next/dist/bin/next", import.meta.url)
  )
  const argumentsList = applicationServerArguments(
    nextCli,
    command,
    extraArguments
  )
  const web = Bun.spawn(argumentsList, {
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
}

if (import.meta.main) {
  await runApplicationServer()
}
