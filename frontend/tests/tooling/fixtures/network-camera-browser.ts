import assert from "node:assert/strict"
import { applicationServerArguments } from "../../../apps/web/scripts/dev"
import { openNetworkSource } from "../../../apps/web/src/features/eye-tracking/network-source"

async function verifyCameraRedirects() {
  const receivedPaths: string[] = []
  const finalCamera = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      receivedPaths.push(new URL(request.url).pathname)
      const content =
        "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: 5\r\n\r\nJPEG1\r\n--frame\r\nContent-Type: image/jpeg\r\nContent-Length: 5\r\n\r\nJPEG2\r\n--frame--\r\n"
      return new Response(content, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "multipart/x-mixed-replace; boundary=frame",
        },
      })
    },
  })
  const redirectCamera = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const status = Number(url.searchParams.get("status"))
      const location = new URL("/live", finalCamera.url)
      return new Response(null, {
        status,
        headers: {
          "Access-Control-Allow-Origin": "*",
          Location: location.href,
        },
      })
    },
  })
  try {
    // Native fetch verifies redirect transport; browser CORS remains camera-dependent.
    for (const status of [301, 302, 303, 307, 308]) {
      const cameraUrl = new URL(`/stream?status=${status}`, redirectCamera.url)
      cameraUrl.hostname = "localhost"
      const source = await openNetworkSource(
        cameraUrl.href,
        new AbortController().signal
      )
      assert.equal(source.kind, "mjpeg")
      if (source.kind !== "mjpeg") {
        throw new Error("Expected a direct MJPEG camera source.")
      }
      assert.equal(source.name, "localhost")
      assert.equal(new TextDecoder().decode(source.firstFrame), "JPEG1")
      const remainingFrames: string[] = []
      for await (const frame of source.frames) {
        remainingFrames.push(new TextDecoder().decode(frame))
      }
      assert.deepEqual(remainingFrames, ["JPEG2"])
    }
    assert.deepEqual(receivedPaths, [
      "/live",
      "/live",
      "/live",
      "/live",
      "/live",
    ])
  } finally {
    redirectCamera.stop(true)
    finalCamera.stop(true)
  }
}

function verifyApplicationArguments() {
  const previousCertificate = process.env.GAZE_DEV_TLS_CERT
  const previousKey = process.env.GAZE_DEV_TLS_KEY
  try {
    delete process.env.GAZE_DEV_TLS_CERT
    delete process.env.GAZE_DEV_TLS_KEY
    assert.deepEqual(
      applicationServerArguments("/test/next-cli", "dev", ["--port", "4014"]),
      [
        process.execPath,
        "/test/next-cli",
        "dev",
        "--webpack",
        "--port",
        "4001",
        "--port",
        "4014",
      ]
    )
    process.env.GAZE_DEV_TLS_CERT = "/test/certificate.pem"
    assert.throws(
      () => applicationServerArguments("/test/next-cli", "dev", []),
      /both.*CERT.*KEY/
    )
    assert.deepEqual(
      applicationServerArguments("/test/next-cli", "start", []),
      [process.execPath, "/test/next-cli", "start", "--port", "4001"]
    )
    process.env.GAZE_DEV_TLS_KEY = "/test/key.pem"
    assert.deepEqual(applicationServerArguments("/test/next-cli", "dev", []), [
      process.execPath,
      "/test/next-cli",
      "dev",
      "--webpack",
      "--experimental-https",
      "--experimental-https-cert",
      "/test/certificate.pem",
      "--experimental-https-key",
      "/test/key.pem",
      "--port",
      "4001",
    ])
  } finally {
    if (previousCertificate === undefined) {
      delete process.env.GAZE_DEV_TLS_CERT
    } else {
      process.env.GAZE_DEV_TLS_CERT = previousCertificate
    }
    if (previousKey === undefined) {
      delete process.env.GAZE_DEV_TLS_KEY
    } else {
      process.env.GAZE_DEV_TLS_KEY = previousKey
    }
  }
}

await verifyCameraRedirects()
verifyApplicationArguments()
