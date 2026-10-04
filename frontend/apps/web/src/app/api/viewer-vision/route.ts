import { proxyVision } from "@/features/camera-viewer/vision-bridge"

export const runtime = "nodejs"
export async function POST(request: Request) {
  return proxyVision(request, {
    url: process.env.GAZE_VISION_URL ?? "",
    secret: process.env.GAZE_VISION_SECRET ?? "",
  })
}
