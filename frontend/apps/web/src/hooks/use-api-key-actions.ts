import { useCallback, useState } from "react"
import { createApiKey, deleteApiKey, listApiKeys } from "@/lib/api-key-client"
import type { ApiKeyRecord } from "@/types/auth"

type UseApiKeyActionsParams = {
  isAuthenticated: boolean
  setBusy: (value: boolean) => void
  setError: (value: string) => void
  setMessage: (value: string) => void
}

export function useApiKeyActions({
  isAuthenticated,
  setBusy,
  setError,
  setMessage,
}: UseApiKeyActionsParams) {
  const [loadingKeys, setLoadingKeys] = useState(false)
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([])
  const [newKeyName, setNewKeyName] = useState("Default Key")
  const [createdApiKey, setCreatedApiKey] = useState("")

  const loadApiKeys = useCallback(async () => {
    if (!isAuthenticated) {
      setApiKeys([])
      return
    }

    setLoadingKeys(true)
    setError("")
    try {
      setApiKeys(await listApiKeys())
    } catch {
      setError("Unable to load API keys.")
    } finally {
      setLoadingKeys(false)
    }
  }, [isAuthenticated, setError])

  async function handleCreateApiKey() {
    const sanitizedName = newKeyName.trim()
    if (!sanitizedName) {
      setError("API key name is required.")
      return
    }

    setBusy(true)
    setError("")
    setMessage("")
    setCreatedApiKey("")

    try {
      setCreatedApiKey(await createApiKey(sanitizedName))
      setMessage("API key created. Copy it now, it may not be shown again.")
      await loadApiKeys()
    } catch {
      setError("Failed to create API key.")
    } finally {
      setBusy(false)
    }
  }

  async function handleCopyCreatedKey() {
    if (!createdApiKey) {
      return
    }

    try {
      await navigator.clipboard.writeText(createdApiKey)
      setMessage("API key copied to clipboard.")
    } catch {
      setError("Could not copy API key. Please copy it manually.")
    }
  }

  async function handleRegenerateApiKey(key: ApiKeyRecord) {
    const baseName = key.name?.trim() || "Regenerated Key"
    const nextName = `${baseName} (rotated)`

    setBusy(true)
    setError("")
    setMessage("")
    setCreatedApiKey("")

    try {
      const newKey = await createApiKey(nextName)
      const deleted = await deleteApiKey(key.id)
      if (!deleted) {
        throw new Error("Delete failed")
      }

      setCreatedApiKey(newKey)
      setMessage("API key regenerated. Copy the new key now.")
      await loadApiKeys()
    } catch {
      setError("Failed to regenerate API key.")
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteApiKey(key: ApiKeyRecord) {
    setBusy(true)
    setError("")
    setMessage("")

    try {
      const deleted = await deleteApiKey(key.id)
      if (!deleted) {
        throw new Error("Delete failed")
      }

      setMessage("API key deleted.")
      await loadApiKeys()
    } catch {
      setError("Failed to delete API key.")
    } finally {
      setBusy(false)
    }
  }

  return {
    loadingKeys,
    apiKeys,
    setApiKeys,
    newKeyName,
    setNewKeyName,
    createdApiKey,
    loadApiKeys,
    handleCreateApiKey,
    handleCopyCreatedKey,
    handleRegenerateApiKey,
    handleDeleteApiKey,
  }
}
