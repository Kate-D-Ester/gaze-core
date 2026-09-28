import { lookup } from "node:dns/promises";
import { createSocket } from "node:dgram";
import { isIP } from "node:net";

type Address = { address: string; family: number };
type RelayFetch = (
  input: Request | string | URL,
  init?: RequestInit,
) => Promise<Response>;
export type CameraRelayDependencies = {
  resolve: (hostname: string) => Promise<Address[]>;
  fetch: RelayFetch;
};

const MAX_URL_LENGTH = 2048;
const HEADER_TIMEOUT_MS = 8000;
const MDNS_TIMEOUT_MS = 3500;
const MDNS_RETRY_INTERVAL_MS = 500;

function encodeDnsName(hostname: string) {
  const bytes: number[] = [];
  for (const label of hostname.replace(/\.$/, "").split(".")) {
    const encoded = new TextEncoder().encode(label);
    if (encoded.length === 0 || encoded.length > 63)
      throw new Error("Invalid mDNS hostname.");
    bytes.push(encoded.length, ...encoded);
  }
  bytes.push(0);
  return new Uint8Array(bytes);
}

function createMdnsQuery(hostname: string) {
  const name = encodeDnsName(hostname);
  const questions = [1, 28].flatMap((type) => [...name, 0, type, 0x80, 1]);
  const header = new Uint8Array(12);
  header[5] = 2;
  const query = new Uint8Array(header.length + questions.length);
  query.set(header);
  query.set(questions, header.length);
  return query;
}

function readDnsName(packet: Uint8Array, start: number) {
  const labels: string[] = [];
  let cursor = start;
  let next = start;
  let jumped = false;
  let hops = 0;
  while (cursor < packet.length) {
    const length = packet[cursor];
    if (length === 0) {
      if (!jumped) next = cursor + 1;
      return { name: labels.join(".").toLowerCase(), next };
    }
    if ((length & 0xc0) === 0xc0) {
      if (cursor + 1 >= packet.length || ++hops > 16) return null;
      const pointer = ((length & 0x3f) << 8) | packet[cursor + 1];
      if (!jumped) next = cursor + 2;
      cursor = pointer;
      jumped = true;
      continue;
    }
    if ((length & 0xc0) !== 0 || cursor + length + 1 > packet.length)
      return null;
    labels.push(
      new TextDecoder().decode(packet.slice(cursor + 1, cursor + 1 + length)),
    );
    cursor += length + 1;
    if (!jumped) next = cursor;
  }
  return null;
}

function ipv6Address(bytes: Uint8Array) {
  const groups = Array.from({ length: 8 }, (_, index) => {
    const value = (bytes[index * 2] << 8) | bytes[index * 2 + 1];
    return value.toString(16);
  });
  return groups.join(":");
}

export function parseMdnsAddresses(
  packet: Uint8Array,
  hostname: string,
): Address[] {
  if (packet.length < 12) return [];
  const view = new DataView(
    packet.buffer,
    packet.byteOffset,
    packet.byteLength,
  );
  const questionCount = view.getUint16(4);
  const recordCount =
    view.getUint16(6) + view.getUint16(8) + view.getUint16(10);
  let offset = 12;
  for (let index = 0; index < questionCount; index++) {
    const question = readDnsName(packet, offset);
    if (!question || question.next + 4 > packet.length) return [];
    offset = question.next + 4;
  }

  const addresses = new Map<string, Address[]>();
  const aliases = new Map<string, string[]>();
  for (let index = 0; index < recordCount; index++) {
    const owner = readDnsName(packet, offset);
    if (!owner || owner.next + 10 > packet.length) return [];
    offset = owner.next;
    const type = view.getUint16(offset);
    offset += 2;
    offset += 2; // class
    offset += 4; // ttl
    const length = view.getUint16(offset);
    offset += 2;
    const dataOffset = offset;
    const dataEnd = dataOffset + length;
    if (dataEnd > packet.length) return [];

    if (type === 1 && length === 4) {
      const address = Array.from(packet.slice(dataOffset, dataEnd)).join(".");
      addresses.set(owner.name, [
        ...(addresses.get(owner.name) ?? []),
        { address, family: 4 },
      ]);
    } else if (type === 28 && length === 16) {
      addresses.set(owner.name, [
        ...(addresses.get(owner.name) ?? []),
        { address: ipv6Address(packet.slice(dataOffset, dataEnd)), family: 6 },
      ]);
    } else if (type === 5) {
      const alias = readDnsName(packet, dataOffset);
      if (!alias) return [];
      aliases.set(owner.name, [...(aliases.get(owner.name) ?? []), alias.name]);
    }
    offset = dataEnd;
  }

  const pending = [hostname.replace(/\.$/, "").toLowerCase()];
  const visited = new Set<string>();
  const result: Address[] = [];
  while (pending.length > 0) {
    const name = pending.pop()!;
    if (visited.has(name)) continue;
    visited.add(name);
    result.push(...(addresses.get(name) ?? []));
    pending.push(...(aliases.get(name) ?? []));
  }
  return result;
}

function resolveMdns(hostname: string) {
  return new Promise<Address[]>((resolve, reject) => {
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    let finished = false;
    let retryTimer: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => finish([], new Error("mDNS host not found.")),
      MDNS_TIMEOUT_MS,
    );
    const finish = (addresses: Address[] = [], error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (retryTimer) clearInterval(retryTimer);
      try {
        socket.close();
      } catch {
        // A bind failure can leave the socket unbound.
      }
      if (error) reject(error);
      else resolve(addresses);
    };
    socket.on("error", (error) => finish([], error));
    socket.on("message", (packet) => {
      const addresses = parseMdnsAddresses(packet, hostname);
      if (addresses.length > 0) finish(addresses);
    });
    socket.bind(0, "0.0.0.0", () => {
      try {
        socket.addMembership("224.0.0.251");
        socket.setMulticastTTL(255);
        const query = createMdnsQuery(hostname);
        const sendQuery = () =>
          socket.send(query, 5353, "224.0.0.251", (error) => {
            if (error) finish([], error);
          });
        sendQuery();
        retryTimer = setInterval(sendQuery, MDNS_RETRY_INTERVAL_MS);
      } catch (error) {
        finish(
          [],
          error instanceof Error ? error : new Error("mDNS query failed."),
        );
      }
    });
  });
}

async function resolveHostname(hostname: string): Promise<Address[]> {
  const normalized = hostname.replace(/\.$/, "");
  if (normalized.toLowerCase().endsWith(".local"))
    return resolveMdns(normalized);

  const family = isIP(hostname);
  if (family) return [{ address: hostname, family }];
  return lookup(hostname, { all: true, verbatim: true });
}

const defaultDependencies: CameraRelayDependencies = {
  resolve: resolveHostname,
  fetch: (...args) => fetch(...args),
};

function isPrivateAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  if (family !== 6) return false;

  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) return isPrivateAddress(mappedIpv4[1]);
  const firstGroup = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return (
    (firstGroup >= 0xfc00 && firstGroup <= 0xfdff) ||
    (firstGroup >= 0xfe80 && firstGroup <= 0xfebf)
  );
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function getBoundary(contentType: string) {
  const match = contentType.match(
    /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i,
  );
  return match?.[1] ?? match?.[2] ?? "";
}

export async function handleCameraMjpeg(
  request: Request,
  overrides: Partial<CameraRelayDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };
  const sourceText = new URL(request.url).searchParams.get("url")?.trim();
  if (!sourceText || sourceText.length > MAX_URL_LENGTH)
    return jsonError("Enter a valid camera stream URL.", 400);

  let source: URL;
  try {
    source = new URL(sourceText);
  } catch {
    return jsonError("Enter a valid camera stream URL.", 400);
  }
  if (
    (source.protocol !== "http:" && source.protocol !== "https:") ||
    source.username ||
    source.password
  )
    return jsonError(
      "Only HTTP camera URLs without credentials are supported.",
      400,
    );

  let addresses: Address[];
  try {
    const hostname = source.hostname.replace(/^\[|\]$/g, "");
    addresses = await dependencies.resolve(hostname);
  } catch {
    return jsonError(
      "The camera host could not be resolved on this network.",
      502,
    );
  }
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPrivateAddress(address))
  )
    return jsonError(
      "Network camera URLs must resolve to a private LAN address.",
      403,
    );

  const controller = new AbortController();
  const abortWithClient = () => controller.abort();
  request.signal.addEventListener("abort", abortWithClient, { once: true });
  const timer = setTimeout(() => controller.abort(), HEADER_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await dependencies.fetch(source, {
      method: "GET",
      headers: { Accept: "multipart/x-mixed-replace" },
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abortWithClient);
    return jsonError("The camera stream could not be reached.", 502);
  }
  clearTimeout(timer);

  const contentType = upstream.headers.get("content-type") ?? "";
  const boundary = getBoundary(contentType);
  const isMjpeg = /^multipart\/x-mixed-replace\b/i.test(contentType);
  if (
    upstream.status < 200 ||
    upstream.status >= 300 ||
    !isMjpeg ||
    !boundary ||
    !upstream.body
  ) {
    await upstream.body?.cancel().catch(() => {});
    request.signal.removeEventListener("abort", abortWithClient);
    return jsonError(
      isMjpeg
        ? "The camera returned an invalid MJPEG stream."
        : "The camera URL is not an MJPEG stream.",
      isMjpeg ? 502 : 415,
    );
  }

  const reader = upstream.body.getReader();
  const cleanup = () =>
    request.signal.removeEventListener("abort", abortWithClient);
  const body = new ReadableStream<Uint8Array>({
    async pull(stream) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          cleanup();
          stream.close();
        } else {
          stream.enqueue(chunk.value);
        }
      } catch (error) {
        cleanup();
        stream.error(error);
      }
    },
    async cancel(reason) {
      cleanup();
      controller.abort();
      await reader.cancel(reason).catch(() => {});
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
