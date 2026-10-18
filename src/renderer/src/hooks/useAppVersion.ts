import { useEffect, useState } from 'react'

// Formats the installed app version exactly as shown in the sidebar footer
// (e.g. "0.1.3" -> "v0.1.3"). Null while unknown so the UI never renders
// a stale hardcoded version. Kept pure for unit testing.
export function formatAppVersion(version: string | null): string | null {
  return version ? `v${version}` : null
}

// Single source of truth for the installed version in the renderer.
// Reads from the main process (package.json version), so every screen that
// uses this hook always shows the current version after an update.
//
// The version is cached at module scope: Layout/SidebarLeft unmounts and remounts
// on every route change (each screen renders its own Layout), so starting
// from null on each mount would flash an empty footer before the async IPC
// resolves. Initializing state from the cache keeps the footer static during
// navigation; only the very first mount fetches.
let cachedVersion: string | null = null
let pendingRequest: Promise<string> | null = null

function requestAppVersion(): Promise<string> | null {
  if (cachedVersion !== null) return null
  if (pendingRequest !== null) return pendingRequest
  if (!window.appInfo?.getVersion) return null
  pendingRequest = window.appInfo.getVersion()
  pendingRequest
    .then((installedVersion) => {
      cachedVersion = installedVersion
    })
    .catch(() => {})
    .finally(() => {
      pendingRequest = null
    })
  return pendingRequest
}

export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(cachedVersion)

  useEffect(() => {
    if (cachedVersion !== null) {
      setVersion(cachedVersion)
      return
    }
    let cancelled = false
    requestAppVersion()
      ?.then((installedVersion) => {
        if (!cancelled) setVersion(installedVersion)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return version
}
