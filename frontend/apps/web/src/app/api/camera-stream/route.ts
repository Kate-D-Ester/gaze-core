import { proxyCameraStream } from "@/features/eye-tracking/camera-stream-server"
export const runtime = "nodejs"
export async function POST(request: Request) {
  return proxyCameraStream(request)
}
