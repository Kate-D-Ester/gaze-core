export type SessionUser = {
  id: string
  email: string
  name?: string | null
}

export type SessionData = {
  user: SessionUser
} | null

export type ApiKeyRecord = {
  id: string
  name?: string
  prefix?: string
  start?: string
  createdAt?: string
  enabled?: boolean
}
