import { useCallback, useEffect, useRef, useState } from 'react'

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

export interface AppUpdateState {
  status: AppUpdateStatus
  version: string | null
  percent: number | null
  installedVersion: string | null
}

export type UpdateFlowAction = 'download' | 'install' | 'stop' | null

interface IncomingStatus {
  status: AppUpdateStatus
  version?: string
  percent?: number
  message?: string
}

// Decides the next step of the one-click flow: check, download, then
// install and restart. Kept pure so the flow can be unit tested.
export function nextFlowAction(
  status: AppUpdateStatus,
  flowArmed: boolean,
  actedOn: AppUpdateStatus | null
): UpdateFlowAction {
  if (!flowArmed) return null
  if (status === 'available' && actedOn !== 'available') return 'download'
  if (status === 'downloaded' && actedOn !== 'downloaded') return 'install'
  if (status === 'up-to-date' || status === 'error' || status === 'idle') return 'stop'
  return null
}

const initialState: AppUpdateState = {
  status: 'idle',
  version: null,
  percent: null,
  installedVersion: null
}

function applyStatus(previous: AppUpdateState, status: IncomingStatus): AppUpdateState {
  return {
    status: status.status,
    version: status.version ?? null,
    percent: status.percent ?? null,
    installedVersion: previous.installedVersion
  }
}

export function useAppUpdate(): AppUpdateState & {
  updateNow: () => void
} {
  const [state, setState] = useState<AppUpdateState>(initialState)
  // Armed only when the user starts the flow, so the automatic check on
  // startup never downloads or restarts the app by itself.
  const flowArmed = useRef(false)
  const actedOn = useRef<AppUpdateStatus | null>(null)

  useEffect(() => {
    if (!window.updater) return

    // Replay the last main-process status: the automatic check on startup
    // may have run before this listener was subscribed.
    window.updater
      .getStatus()
      .then((status) => {
        if (status.status !== 'idle') {
          setState((previous) => applyStatus(previous, status))
        }
      })
      .catch(() => {})

    window.appInfo
      ?.getVersion()
      .then((installedVersion) => {
        setState((previous) => ({ ...previous, installedVersion }))
      })
      .catch(() => {})

    const unsubscribe = window.updater.onStatus((status) => {
      setState((previous) => applyStatus(previous, status))
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // Advances the one-click flow as main-process statuses arrive.
  useEffect(() => {
    const action = nextFlowAction(state.status, flowArmed.current, actedOn.current)
    if (action === 'download') {
      actedOn.current = 'available'
      window.updater?.downloadUpdate().catch(() => {
        // Failure is broadcast back through `onStatus` as `error`.
      })
    } else if (action === 'install') {
      actedOn.current = 'downloaded'
      setState((previous) => ({ ...previous, status: 'installing' }))
      window.updater?.installUpdate().catch(() => {})
    } else if (action === 'stop') {
      flowArmed.current = false
    }
  }, [state.status])

  const updateNow = useCallback(() => {
    flowArmed.current = true
    actedOn.current = null
    window.updater?.checkForUpdates().catch(() => {
      // Failure is broadcast back through `onStatus` as `error`.
    })
  }, [])

  return { ...state, updateNow }
}
