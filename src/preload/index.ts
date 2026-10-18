import { contextBridge, ipcRenderer } from 'electron'
import type { ModChangedMessage, ModsSnapshot } from '../types/mods'
import type { PlayerProfile, ProfileSaveResult } from '../types/profiles'
import type { StoreSetResult } from '../types/store'
import type { WindowStateMessage } from '../types/ipc'
import { isSendChannel } from '../types/ipc'
import type { SendChannel } from '../types/ipc'
import type {
  PlayerSetup,
  PracticeGuardResult,
  SetupSaveResult,
  SetupDeleteResult,
  SetupSelectResult
} from '../types/setups'

const electron = {
  ipcRenderer: {
    send: (channel: SendChannel, ...args: unknown[]): void => {
      if (!isSendChannel(channel)) throw new Error('Invalid IPC channel.')
      ipcRenderer.send(channel, ...args)
    }
  }
}

const api = {
  launch: (): Promise<void> => ipcRenderer.invoke('launch'),
  isRunning: (): Promise<boolean> => ipcRenderer.invoke('is-running'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized')
}

export interface DetectedPaths {
  steamPath: string | null
  gamePath: string | null
  modsPath: string | null
  profilePath: string | null
}

const paths = {
  detect: (): Promise<DetectedPaths> => ipcRenderer.invoke('paths:detect')
}

const profiles = {
  list: (dir?: string): Promise<PlayerProfile[]> => ipcRenderer.invoke('profiles:list', dir),
  active: (): Promise<PlayerProfile | null> => ipcRenderer.invoke('profiles:active'),
  save: (args: { id: string; name: string; raceNumber: string }): Promise<ProfileSaveResult> =>
    ipcRenderer.invoke('profiles:save', args)
}

const setups = {
  list: (): Promise<PlayerSetup[]> => ipcRenderer.invoke('setups:list'),
  create: (data: Omit<PlayerSetup, 'id'>): Promise<SetupSaveResult> =>
    ipcRenderer.invoke('setups:create', data),
  update: (id: string, data: Partial<Omit<PlayerSetup, 'id'>>): Promise<SetupSaveResult> =>
    ipcRenderer.invoke('setups:update', id, data),
  delete: (id: string): Promise<SetupDeleteResult> => ipcRenderer.invoke('setups:delete', id),
  select: (id: string | null): Promise<SetupSelectResult> => ipcRenderer.invoke('setups:select', id)
}

const mods = {
  getAll: (): Promise<ModsSnapshot> => ipcRenderer.invoke('mods:getAll'),
  // Explicit user refresh: full rescan ignoring the focus gate. The result
  // arrives as mods:changed when it differs, so this resolves without a
  // payload and the current snapshot is never cleared.
  refresh: (): Promise<void> => ipcRenderer.invoke('mods:refresh'),
  onChanged: (callback: (message: ModChangedMessage) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, message: ModChangedMessage): void =>
      callback(message)
    ipcRenderer.on('mods:changed', listener)
    return () => ipcRenderer.removeListener('mods:changed', listener)
  }
}

const windowState = {
  onChange: (callback: (message: WindowStateMessage) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, message: WindowStateMessage): void =>
      callback(message)
    ipcRenderer.on('window:state', listener)
    return () => ipcRenderer.removeListener('window:state', listener)
  }
}

export interface AppValidationIssue {
  code: string
  title: string
  message: string
}

export interface AppValidationResult {
  valid: boolean
  issues: AppValidationIssue[]
}

const validation = {
  validateApp: (): Promise<AppValidationResult> => ipcRenderer.invoke('validate:app')
}

const store = {
  get: <T = unknown>(key: string): Promise<T> => ipcRenderer.invoke('store:get', key),
  set: (key: string, value: unknown): Promise<StoreSetResult> =>
    ipcRenderer.invoke('store:set', key, value)
}

// The 7 setup-guarded practice handlers return setup-locked instead of
// throwing when a valid setup is active. Track/layout/sync/validate keep
// their own results.
const practice = {
  selectBike: (bikeId: string, paints: string[]): Promise<PracticeGuardResult> =>
    ipcRenderer.invoke('practice:select-bike', bikeId, paints),
  selectTrack: (trackId: string, layouts: string[]): Promise<void> =>
    ipcRenderer.invoke('practice:select-track', trackId, layouts),
  setBikePaint: (paint: string): Promise<PracticeGuardResult> =>
    ipcRenderer.invoke('practice:set-bike-paint', paint),
  setTrackLayout: (layout: string): Promise<void> =>
    ipcRenderer.invoke('practice:set-track-layout', layout),
  selectHelmet: (helmetId: string, paints: string[]): Promise<PracticeGuardResult> =>
    ipcRenderer.invoke('practice:select-helmet', helmetId, paints),
  setHelmetPaint: (paint: string): Promise<PracticeGuardResult> =>
    ipcRenderer.invoke('practice:set-helmet-paint', paint),
  selectRider: (suitId: string, paints: string[]): Promise<PracticeGuardResult> =>
    ipcRenderer.invoke('practice:select-rider', suitId, paints),
  setSuitPaint: (paint: string): Promise<PracticeGuardResult> =>
    ipcRenderer.invoke('practice:set-suit-paint', paint),
  selectRidingStyle: (styleId: string): Promise<PracticeGuardResult> =>
    ipcRenderer.invoke('practice:select-riding-style', styleId),
  validate: (): Promise<{ repaired: string[]; modsMissing: boolean }> =>
    ipcRenderer.invoke('practice:validate'),
  sync: (): Promise<boolean> => ipcRenderer.invoke('practice:sync')
}

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
}

const appInfo = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version')
}

const launcher = {
  reset: (): Promise<void> => ipcRenderer.invoke('launcher:reset')
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

const updater = {
  checkForUpdates: (): Promise<UpdateCheckResult> => ipcRenderer.invoke('updater:check'),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('updater:download'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  getStatus: (): Promise<UpdaterStatus> => ipcRenderer.invoke('updater:get-status'),
  onStatus: (callback: (status: UpdaterStatus) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, status: UpdaterStatus): void => callback(status)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  }
}

contextBridge.exposeInMainWorld('electron', electron)
contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('windowState', windowState)
contextBridge.exposeInMainWorld('store', store)
contextBridge.exposeInMainWorld('practice', practice)
contextBridge.exposeInMainWorld('appInfo', appInfo)
contextBridge.exposeInMainWorld('launcher', launcher)
contextBridge.exposeInMainWorld('updater', updater)
contextBridge.exposeInMainWorld('paths', paths)
contextBridge.exposeInMainWorld('profiles', profiles)
contextBridge.exposeInMainWorld('setups', setups)
contextBridge.exposeInMainWorld('validation', validation)
contextBridge.exposeInMainWorld('mods', mods)
