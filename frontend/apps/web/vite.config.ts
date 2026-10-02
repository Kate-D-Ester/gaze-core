import path from "path"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const tlsCertificate = process.env.GAZE_DEV_TLS_CERT
const tlsKey = process.env.GAZE_DEV_TLS_KEY
if (Boolean(tlsCertificate) !== Boolean(tlsKey))
  throw new Error(
    "Set both GAZE_DEV_TLS_CERT and GAZE_DEV_TLS_KEY to enable secure phone camera testing."
  )

const configDirectory = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4001,
    https:
      tlsCertificate && tlsKey
        ? { cert: readFileSync(tlsCertificate), key: readFileSync(tlsKey) }
        : undefined,
    fs: {
      allow: [path.resolve(configDirectory, "../..")],
    },
  },
  worker: { format: "es" },
  preview: {
    port: 4001,
  },
  resolve: {
    alias: {
      "@": path.resolve(configDirectory, "./src"),
    },
  },
})
