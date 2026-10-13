export type GuestIdentity = {
  session: string
  key: CryptoKey
  publicKey: string
}
export type SignedCommandInput = {
  boot: string
  seq: number
  action: string
  data: Record<string, unknown>
}
