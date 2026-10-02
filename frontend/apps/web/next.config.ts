import type { NextConfig } from "next"
import path from "node:path"

const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...(process.env.GAZE_DEV_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ],
  output: "standalone",
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  reactStrictMode: true,
  transpilePackages: ["@workspace/ui"],
  env: {
    // Migrate the existing local frontend setting without exposing server secrets.
    NEXT_PUBLIC_GAZECORE_BACKEND_URL:
      process.env.NEXT_PUBLIC_GAZECORE_BACKEND_URL ??
      process.env.VITE_GAZECORE_BACKEND_URL ??
      "http://localhost:4000",
  },
  async redirects() {
    return [
      {
        source: "/v2",
        destination: "/trial/screen-eye-tracking",
        permanent: true,
      },
      {
        source: "/trial",
        destination: "/trial/screen-eye-tracking",
        permanent: true,
      },
      {
        source: "/trials",
        destination: "/trial/screen-eye-tracking",
        permanent: true,
      },
      {
        source: "/trials/remote-eye-tracking",
        destination: "/trial/remote-eye-tracking",
        permanent: true,
      },
    ]
  },
  webpack(config) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    }
    return config
  },
}

export default nextConfig
