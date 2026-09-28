import path from "path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const configDirectory = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
