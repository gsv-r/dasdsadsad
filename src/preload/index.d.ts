import type { ModChangedMessage, ModsSnapshot } from '../types/mods'
import type { PlayerProfile, ProfileSaveResult } from '../types/profiles'
import type { StoreSetResult } from '../types/store'
import type { SendChannel } from '../types/ipc'
import type { StoreReadKey } from '../types/store'
import type { PlayerSetup, PracticeGuardResult, SetupSaveResult, SetupDeleteResult, SetupSelectResult } from '../types/setups'

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
}

export interface UpdaterStatus {
  status: 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  message?: string
}

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        send: (channel: SendChannel, ...args: unknown[]) => void
      }
    }
    api: {
      launch: () => Promise<void>
      isRunning: () => Promise<boolean>
      isMaximized: () => Promise<boolean>
    }
    store: {
      get: <T = unknown>(key: StoreReadKey) => Promise<T>
      set: (key: string, value: unknown) => Promise<StoreSetResult>
    }
    practice: {
      selectBike: (bikeId: string, paints: string[]) => Promise<PracticeGuardResult>
      selectTrack: (trackId: string, layouts: string[]) => Promise<void>
      setBikePaint: (paint: string) => Promise<PracticeGuardResult>
      setTrackLayout: (layout: string) => Promise<void>
      selectHelmet: (helmetId: string, paints: string[]) => Promise<PracticeGuardResult>
      setHelmetPaint: (paint: string) => Promise<PracticeGuardResult>
      selectRider: (suitId: string, paints: string[]) => Promise<PracticeGuardResult>
      setSuitPaint: (paint: string) => Promise<PracticeGuardResult>
      selectRidingStyle: (styleId: string) => Promise<PracticeGuardResult>
      validate: () => Promise<{ repaired: string[]; modsMissing: boolean }>
      sync: () => Promise<boolean>
    }
    paths: {
      detect: () => Promise<{
        steamPath: string | null
        gamePath: string | null
        modsPath: string | null
        profilePath: string | null
      }>
    }
    profiles: {
      list: (dir?: string) => Promise<PlayerProfile[]>
      active: () => Promise<PlayerProfile | null>
      save: (args: { id: string; name: string; raceNumber: string }) => Promise<ProfileSaveResult>
    }
    setups: {
      list: () => Promise<PlayerSetup[]>
      create: (data: Omit<PlayerSetup, 'id'>) => Promise<SetupSaveResult>
      update: (id: string, data: Partial<Omit<PlayerSetup, 'id'>>) => Promise<SetupSaveResult>
      delete: (id: string) => Promise<SetupDeleteResult>
      select: (id: string | null) => Promise<SetupSelectResult>
    }
    mods: {
      getAll: () => Promise<ModsSnapshot>
      refresh: () => Promise<void>
      onChanged: (callback: (message: ModChangedMessage) => void) => () => void
    }
    windowState: {
      onChange: (callback: (message: { maximized: boolean }) => void) => () => void
    }
    validation: {
      validateApp: () => Promise<{
        valid: boolean
        issues: { code: string; title: string; message: string }[]
      }>
    }
    appInfo: {
      getVersion: () => Promise<string>
    }
    launcher: {
      reset: () => Promise<void>
    }
    updater: {
      checkForUpdates: () => Promise<UpdateCheckResult>
      downloadUpdate: () => Promise<void>
      installUpdate: () => Promise<void>
      getStatus: () => Promise<UpdaterStatus>
      onStatus: (callback: (status: UpdaterStatus) => void) => () => void
    }
  }
}