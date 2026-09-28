export function getFrontendOrigins(
  frontendUrl = process.env.FRONTEND_URL || "http://localhost:4001",
): string[] {
  let frontendOrigin: URL

  try {
    frontendOrigin = new URL(frontendUrl)
  } catch {
    return [frontendUrl]
  }

  const origins = [frontendOrigin.origin]

  if (frontendOrigin.hostname === "localhost") {
    frontendOrigin.hostname = "127.0.0.1"
    origins.push(frontendOrigin.origin)
  } else if (frontendOrigin.hostname === "127.0.0.1") {
    frontendOrigin.hostname = "localhost"
    origins.push(frontendOrigin.origin)
  }

  return origins
}
