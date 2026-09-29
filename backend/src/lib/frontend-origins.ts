const LOCAL_FRONTEND_HOSTNAMES = ["localhost", "127.0.0.1"]
const LOCAL_FRONTEND_PORTS = ["4001", "4013"]

export function getFrontendOrigins(
  frontendUrl = process.env.FRONTEND_URL || "http://localhost:4001",
): string[] {
  let frontendOrigin: URL

  try {
    frontendOrigin = new URL(frontendUrl)
  } catch {
    return [frontendUrl]
  }

  const origins = new Set([frontendOrigin.origin])
  const isLocalFrontend = LOCAL_FRONTEND_HOSTNAMES.includes(
    frontendOrigin.hostname
  )

  if (!isLocalFrontend) {
    return [...origins]
  }

  const localPorts = new Set([
    frontendOrigin.port,
    ...LOCAL_FRONTEND_PORTS,
  ])

  for (const hostname of LOCAL_FRONTEND_HOSTNAMES) {
    for (const port of localPorts) {
      const localOrigin = new URL(frontendOrigin.origin)
      localOrigin.hostname = hostname
      localOrigin.port = port
      origins.add(localOrigin.origin)
    }
  }

  return [...origins]
}
