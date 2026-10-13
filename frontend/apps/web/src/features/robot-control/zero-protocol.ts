import type { GuestIdentity, SignedCommandInput } from "./zero-protocol.types"
/** Zero firmware v1 wire format; compatible with its static controller's protocol.js. */
const encoder = new TextEncoder()
const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("")
export async function createGuestIdentity(): Promise<GuestIdentity> {
  if (!crypto.subtle) {
    throw new Error(
      "Open the viewer using localhost or HTTPS to authenticate bot commands."
    )
  }
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"]
  )
  return {
    session: hex(crypto.getRandomValues(new Uint8Array(16))),
    key: keys.privateKey,
    publicKey: hex(await crypto.subtle.exportKey("raw", keys.publicKey)),
  }
}
export async function signMessage(
  identity: GuestIdentity,
  input: SignedCommandInput
) {
  if (
    !Number.isSafeInteger(input.seq) ||
    input.seq < 1 ||
    input.seq > 0x7fffffff
  ) {
    throw new Error("Bot command sequence exhausted. Reconnect the bot.")
  }
  const message = {
    v: 1,
    role: "guest",
    boot: input.boot,
    session: identity.session,
    seq: input.seq,
    action: input.action,
    data: JSON.stringify(input.data),
  }
  const canonical = [
    message.role,
    message.boot,
    message.session,
    message.seq,
    message.action,
    message.data,
  ].join("\n")
  const signature = hex(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      identity.key,
      encoder.encode(canonical)
    )
  )
  return { ...message, signature }
}
