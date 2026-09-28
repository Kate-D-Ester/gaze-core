import { expect, test } from "bun:test";
import { handleCameraMjpeg, parseMdnsAddresses } from "../lib/camera-mjpeg";

test("mDNS resolver decodes compressed A records for the requested .local host", () => {
  const questionName = [5, 101, 115, 112, 51, 50, 5, 108, 111, 99, 97, 108, 0];
  const packet = new Uint8Array([
    0,
    0,
    0x84,
    0, // response, authoritative
    0,
    1, // one question
    0,
    1, // one answer
    0,
    0,
    0,
    0, // no authority or additional records
    ...questionName,
    0,
    1,
    0,
    1, // A, IN
    0xc0,
    0x0c, // answer owner points to the question name
    0,
    1,
    0x80,
    1, // A, cache-flush IN
    0,
    0,
    0,
    120, // TTL
    0,
    4, // four bytes
    192,
    168,
    1,
    11,
  ]);

  expect(parseMdnsAddresses(packet, "esp32.local")).toEqual([
    { address: "192.168.1.11", family: 4 },
  ]);
});

test("MJPEG relay preserves a private camera stream and its multipart type", async () => {
  const multipart =
    "--frame\r\nContent-Type: image/jpeg\r\n\r\nframe-bytes\r\n";
  const request = new Request(
    `http://localhost/api/camera/mjpeg?url=${encodeURIComponent("http://esp32.local/stream")}`,
  );
  const response = await handleCameraMjpeg(request, {
    resolve: async (hostname) => {
      expect(hostname).toBe("esp32.local");
      return [{ address: "192.168.1.11", family: 4 }];
    },
    fetch: async () =>
      new Response(multipart, {
        headers: {
          "Content-Type": "multipart/x-mixed-replace; boundary=frame",
        },
      }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe(
    "multipart/x-mixed-replace; boundary=frame",
  );
  expect(await response.text()).toBe(multipart);
});

test("MJPEG relay rejects camera names that resolve outside the private network", async () => {
  const response = await handleCameraMjpeg(
    new Request(
      `http://localhost/api/camera/mjpeg?url=${encodeURIComponent("http://camera.example/stream")}`,
    ),
    {
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      fetch: async () => {
        throw new Error("Public destinations must never be fetched.");
      },
    },
  );

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: "Network camera URLs must resolve to a private LAN address.",
  });
});

test("MJPEG relay declines normal video content so the browser player can handle it", async () => {
  const response = await handleCameraMjpeg(
    new Request(
      `http://localhost/api/camera/mjpeg?url=${encodeURIComponent("http://192.168.1.20/clip.mp4")}`,
    ),
    {
      resolve: async () => [{ address: "192.168.1.20", family: 4 }],
      fetch: async () =>
        new Response("video", { headers: { "Content-Type": "video/mp4" } }),
    },
  );

  expect(response.status).toBe(415);
  expect(await response.json()).toEqual({
    error: "The camera URL is not an MJPEG stream.",
  });
});
