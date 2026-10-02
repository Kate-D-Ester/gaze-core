import { createApp } from "./app"

const parsedPort = Number.parseInt(process.env.PORT ?? "4000", 10)
const port = Number.isNaN(parsedPort) ? 4000 : parsedPort
const app = createApp()

app.listen(port)

async function stopServer() {
  await app.stop()
  process.exit(0)
}

process.once("SIGINT", () => {
  void stopServer()
})
process.once("SIGTERM", () => {
  void stopServer()
})

console.log(`
GazeCore backend is running at http://localhost:${port}
Better Auth: http://localhost:${port}/api/auth
Health Check: http://localhost:${port}/health
Swagger: http://localhost:${port}/swagger
`)
