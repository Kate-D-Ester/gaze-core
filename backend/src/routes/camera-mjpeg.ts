import { Elysia } from "elysia";
import { handleCameraMjpeg } from "../lib/camera-mjpeg";

export const cameraMjpegRoutes = new Elysia({ prefix: "/camera" }).get(
  "/mjpeg",
  ({ request }) => handleCameraMjpeg(request),
);
