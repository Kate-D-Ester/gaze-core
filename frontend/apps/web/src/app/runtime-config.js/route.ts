export const dynamic = "force-dynamic"

/** Only this public service URL may cross the server-to-browser boundary. */
export function GET() {
  // Runtime server settings must precede NEXT_PUBLIC's build-time fallback.
  // Next replaces public environment references in compiled server routes too.
  const configured =
    process.env.GAZECORE_BACKEND_URL ??
    process.env.VITE_GAZECORE_BACKEND_URL ??
    process.env.NEXT_PUBLIC_GAZECORE_BACKEND_URL ??
    "http://localhost:4000"
  const url = URL.parse(configured)
  if (
    !url ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return new Response("Invalid public backend URL configuration", {
      status: 500,
    })
  }
  const configuration = { backendBaseUrl: url.href.replace(/\/+$/g, "") }
  const script = `window.__GAZECORE_CONFIG__ = ${JSON.stringify(configuration)};`
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
