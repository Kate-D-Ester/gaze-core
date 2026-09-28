import path from "path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { once } from "node:events"
import type { PreviewServer, ViteDevServer } from "vite"
import { defineConfig } from "vite"
import { handleCameraMjpeg } from "../../../backend/src/lib/camera-mjpeg"

const configDirectory = path.dirname(fileURLToPath(import.meta.url))

function installCameraRelay(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((request, response, next) => {
    const address = `http://${request.headers.host || "localhost"}`
    const requestUrl = new URL(request.url || "/", address)
    if (requestUrl.pathname !== "/api/camera/mjpeg") return next()
    if (request.method !== "GET") {
      response.writeHead(405).end()
      return
    }

    const abort = new AbortController()
    const cancel = () => abort.abort()
    request.once("aborted", cancel)
    response.once("close", cancel)

    void (async () => {
      const relayRequest = new Request(requestUrl, {
        method: "GET",
        signal: abort.signal,
      })
      const relayResponse = await handleCameraMjpeg(relayRequest)
      relayResponse.headers.forEach((value, key) =>
        response.setHeader(key, value)
      )
      response.writeHead(relayResponse.status)

      if (!relayResponse.body) {
        response.end()
        return
      }

      const reader = relayResponse.body.getReader()
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          if (!response.write(Buffer.from(chunk.value)))
            await once(response, "drain")
        }
        response.end()
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    })().catch((error: unknown) => {
      if (response.destroyed) return
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined)
        return
      }
      response.writeHead(502, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: "The camera relay failed." }))
    })
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: "gaze-core-camera-mjpeg-relay",
      configureServer: installCameraRelay,
      configurePreviewServer: installCameraRelay,
    },
    react(),
    tailwindcss(),
  ],
  server: {
    port: 4001,
    fs: {
      allow: [path.resolve(configDirectory, "../..")],
    },
  },
  preview: {
    port: 4001,
  },
  resolve: {
    alias: {
      "@": path.resolve(configDirectory, "./src"),
    },
  },
})
