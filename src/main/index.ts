import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import fs from 'fs/promises'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import {
  getDetectedPaths,
  getResolvedGamePath,
  getResolvedModsPath,
  getResolvedProfilePath,
  getResolvedSteamPath,
  isValidManualModsValue,
  isValidManualProfileValue,
  resolveSteamExecutable,
  sameModsPath
} from './functions/paths'
import { resolveLocalFilePath } from './functions/localFile'
import {
  getActiveProfile,
  listProfiles,
  listProfilesIn,
  saveProfileInfo,
  updateActiveProfileView
} from './functions/profiles'
import { validateApp } from './functions/validate'
import { store } from './store'
import {
  applySetup,
  createSetup,
  deleteSetup,
  listSetups,
  updateSetup,
  withSetupGuard
} from './functions/setups'
import type { SetupDeleteResult, SetupSaveResult, SetupSelectResult } from '../types/setups'
import { setupCreateArgsSchema } from '../types/setups'
import { isRunning, launch } from './functions/launch'
import { writePracticeIni } from './functions/practiceIni'
import {
  persistPracticeIni,
  selectBike,
  selectHelmet,
  selectRider,
  selectRidingStyle,
  selectTrack,
  setBikePaint,
  setHelmetPaint,
  setSuitPaint,
  setTrackLayout
} from './functions/practice'
import { validateAndRepairPracticeState } from './functions/practiceValidate'
import { GAME_APP_ID, PRACTICE_LAUNCH_ARGS } from './constants'
import { resetLauncher } from './functions/reset'
import {
  flushModsCache,
  getModsSnapshotFresh,
  initModsWatcher,
  refreshByFocus,
  refreshModsNow,
  refreshModsWatcher,
  stopModsWatcher
} from './functions/modsWatcher'
import type { ModChangedMessage } from '../types/mods'
import type { ProfileSaveResult } from '../types/profiles'
import { profileSaveArgsSchema } from '../types/profiles'
import type { StoreSetResult } from '../types/store'
import { STORE_WRITE_SCHEMAS, isStoreReadKey, isStoreWriteKey } from '../types/store'
import {
  practiceSelectBikeArgs,
  practiceSelectHelmetArgs,
  practiceSelectRiderArgs,
  practiceSelectRidingStyleArgs,
  practiceSelectTrackArgs,
  practiceSetBikePaintArgs,
  practiceSetHelmetPaintArgs,
  practiceSetSuitPaintArgs,
  practiceSetTrackLayoutArgs
} from '../types/practiceArgs'
import {
  registerUpdater,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  getAppVersion,
  getUpdaterStatus,
  stopUpdaterChecks
} from './functions/updater'

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

// Electron Store is the only source of paths during initialization.
// No auto-detection runs here: effective values come from the shared
// resolvers (manual `paths.*` ?? last auto-detection `pathsAuto.*`),
// the exact same source the Launch validation checks, so validation
// and launch can never disagree. Null effective means "not configured".
function getStoredPaths(): {
  steamPath: string | null
  gamePath: string | null
  modsPath: string | null
} {
  return {
    steamPath: resolveSteamExecutable(getResolvedSteamPath()),
    gamePath: getResolvedGamePath(),
    modsPath: getResolvedModsPath()
  }
}

export const INITIAL_WIDTH = 1442
export const INITIAL_HEIGHT = 901

export function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: INITIAL_WIDTH,
    height: INITIAL_HEIGHT,
    minWidth: INITIAL_WIDTH,
    minHeight: INITIAL_HEIGHT,
    resizable: true,
    maximizable: true,
    fullscreenable: false,
    title: 'Knee Down',
    show: false,
    autoHideMenuBar: false,
    frame: false,
    roundedCorners: false,
    icon: join(__dirname, '..', '..', 'resources', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Broadcast the maximized state so the renderer keeps the window-control
  // icon in sync without flickering on the first frame.
  function broadcastWindowState(): void {
    window.webContents.send('window:state', { maximized: window.isMaximized() })
  }
  window.on('maximize', broadcastWindowState)
  window.on('unmaximize', broadcastWindowState)
  window.on('enter-full-screen', broadcastWindowState)
  window.on('leave-full-screen', broadcastWindowState)

  ipcMain.on('minimize', () => window.minimize())
  ipcMain.on('close', () => window.close())
  ipcMain.on('window:maximize', () => {
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.on('window:reload', () => window.webContents.reload())
  ipcMain.handle('window:is-maximized', () => window.isMaximized())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

async function handleLaunchRequest(): Promise<string> {
  // Defense in depth: the renderer runs the central validation first and
  // blocks the action, but the main process never launches on invalid config.
  const validation = validateApp()
  if (!validation.valid) {
    // New rule: an invalid mods path at Go Ride also resets the mods cache.
    // Only the existing path validation triggers this: a null resolved
    // path. Any other launch failure leaves the cache untouched.
    if (getResolvedModsPath() === null) {
      try {
        await refreshModsWatcher()
      } catch (error) {
        console.error('Failed to reset mods cache on invalid path:', error)
      }
    }
    throw new Error(validation.issues[0]?.message ?? 'Application validation failed.')
  }

  // Store-only: never auto-detect here, use exactly the persisted values.
  const { steamPath: steamExe, gamePath } = getStoredPaths()
  if (!steamExe) throw new Error('Steam not found.')

  if (!gamePath) throw new Error('Game folder not found.')

  writePracticeIni(gamePath)
  // Update the [view] section of the active profile's profile.ini before launch
  updateActiveProfileView()
  return launch(steamExe, GAME_APP_ID, PRACTICE_LAUNCH_ARGS)
}

function registerAppIpcHandlers(): void {
  ipcMain.handle('store:get', (_e, key: string) => {
    if (!isStoreReadKey(key)) {
      throw new Error('Invalid store key.')
    }
    // The guard above validated membership; the store library only accepts
    // the plain string form for a mixed key union.
    const storeKey: string = key
    return store.get(storeKey)
  })
  ipcMain.handle('store:set', (_e, key: string, value: unknown): StoreSetResult => {
    if (!isStoreWriteKey(key)) {
      return { ok: false, reason: 'unknown-key' }
    }
    // Type shape first: a non-string/non-null value never reaches the
    // filesystem gates below, so it reports `invalid-value` instead of a
    // misleading folder reason.
    if (!STORE_WRITE_SCHEMAS[key].safeParse(value).success) {
      return { ok: false, reason: 'invalid-value' }
    }
    // A manual mods path persists only when valid: a partial keystroke must
    // never shadow a valid auto-detection with an invalid override. The
    // rejection returns before any write, so an invalid value never persists
    // and never resyncs the watcher. Same for profile path. Steam/game keep
    // the previous behavior (no gate). Returning instead of throwing keeps an
    // expected rejection out of the console handler-error noise.
    if (key === 'paths.mods' && !isValidManualModsValue(value)) {
      return { ok: false, reason: 'invalid-mods-folder' }
    }
    if (key === 'paths.profile' && !isValidManualProfileValue(value)) {
      return { ok: false, reason: 'invalid-profile-folder' }
    }
    const watchesModsPath = key === 'paths.mods' || key === 'pathsAuto.mods'
    const watchesProfilePath = key === 'paths.profile' || key === 'pathsAuto.profile'
    const beforeMods = watchesModsPath ? getResolvedModsPath() : null
    const beforeProfile = watchesProfilePath ? getResolvedProfilePath() : null
    store.set(key, value)
    if (watchesModsPath && !sameModsPath(getResolvedModsPath(), beforeMods)) {
      void refreshModsWatcher()
    }
    if (watchesProfilePath && getResolvedProfilePath() !== beforeProfile) {
      // Profile path change: no watcher to refresh, but the resolved value
      // will be used on next validation/launch.
    }
    return { ok: true }
  })

  ipcMain.handle('mods:getAll', () => getModsSnapshotFresh())

  // Explicit user refresh: rescans ignoring the focus gate. Single-flight in
  // the watcher, so repeated clicks share one scan.
  ipcMain.handle('mods:refresh', () => refreshModsNow())

  ipcMain.handle('practice:select-bike', (_e, ...raw: unknown[]) => {
    const parsed = practiceSelectBikeArgs.safeParse({ bikeId: raw[0], paints: raw[1] })
    if (!parsed.success) throw new Error('Invalid bike selection.')
    return withSetupGuard(selectBike)(parsed.data.bikeId, parsed.data.paints ?? [])
  })
  ipcMain.handle('practice:select-track', (_e, ...raw: unknown[]) => {
    const parsed = practiceSelectTrackArgs.safeParse({ trackId: raw[0], layouts: raw[1] })
    if (!parsed.success) throw new Error('Invalid track selection.')
    return selectTrack(parsed.data.trackId, parsed.data.layouts ?? [])
  })
  ipcMain.handle('practice:set-bike-paint', (_e, ...raw: unknown[]) => {
    const parsed = practiceSetBikePaintArgs.safeParse({ paint: raw[0] })
    if (!parsed.success) throw new Error('Invalid bike paint selection.')
    return withSetupGuard(setBikePaint)(parsed.data.paint)
  })
  ipcMain.handle('practice:set-track-layout', (_e, ...raw: unknown[]) => {
    const parsed = practiceSetTrackLayoutArgs.safeParse({ layout: raw[0] })
    if (!parsed.success) throw new Error('Invalid track layout selection.')
    return setTrackLayout(parsed.data.layout)
  })
  ipcMain.handle('practice:select-helmet', (_e, ...raw: unknown[]) => {
    const parsed = practiceSelectHelmetArgs.safeParse({ helmetId: raw[0], paints: raw[1] })
    if (!parsed.success) throw new Error('Invalid helmet selection.')
    return withSetupGuard(selectHelmet)(parsed.data.helmetId, parsed.data.paints ?? [])
  })
  ipcMain.handle('practice:set-helmet-paint', (_e, ...raw: unknown[]) => {
    const parsed = practiceSetHelmetPaintArgs.safeParse({ paint: raw[0] })
    if (!parsed.success) throw new Error('Invalid helmet paint selection.')
    return withSetupGuard(setHelmetPaint)(parsed.data.paint)
  })
  ipcMain.handle('practice:select-rider', (_e, ...raw: unknown[]) => {
    const parsed = practiceSelectRiderArgs.safeParse({ suitId: raw[0], paints: raw[1] })
    if (!parsed.success) throw new Error('Invalid rider selection.')
    return withSetupGuard(selectRider)(parsed.data.suitId, parsed.data.paints ?? [])
  })
  ipcMain.handle('practice:set-suit-paint', (_e, ...raw: unknown[]) => {
    const parsed = practiceSetSuitPaintArgs.safeParse({ paint: raw[0] })
    if (!parsed.success) throw new Error('Invalid suit paint selection.')
    return withSetupGuard(setSuitPaint)(parsed.data.paint)
  })
  ipcMain.handle('practice:select-riding-style', (_e, ...raw: unknown[]) => {
    const parsed = practiceSelectRidingStyleArgs.safeParse({ styleId: raw[0] })
    if (!parsed.success) throw new Error('Invalid riding style selection.')
    return withSetupGuard(selectRidingStyle)(parsed.data.styleId)
  })
  ipcMain.handle('practice:sync', () => persistPracticeIni())
  ipcMain.handle('practice:validate', () => validateAndRepairPracticeState())

  ipcMain.handle('is-running', () => isRunning())
  ipcMain.handle('launch', () => handleLaunchRequest())

  ipcMain.handle('paths:detect', () => getDetectedPaths())

  ipcMain.handle('profiles:list', (_e, dir?: unknown) =>
    typeof dir === 'string' && dir.trim() !== '' ? listProfilesIn(dir) : listProfiles()
  )

  ipcMain.handle('profiles:active', () => getActiveProfile())

  ipcMain.handle('profiles:save', (_e, args: unknown): ProfileSaveResult => {
    const parsed = profileSaveArgsSchema.safeParse(args)
    if (!parsed.success) {
      // Field priority matches the previous checks and never depends on the
      // order of Zod issues: id, then name, then race number.
      const record =
        typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
      if (typeof record.id !== 'string') return { ok: false, reason: 'invalid-id' }
      if (typeof record.name !== 'string') return { ok: false, reason: 'invalid-name' }
      return { ok: false, reason: 'invalid-race-number' }
    }
    const { id, name, raceNumber } = parsed.data
    return saveProfileInfo(id, name, raceNumber)
  })

  ipcMain.handle('setups:list', () => listSetups())

  ipcMain.handle('setups:create', (_e, args: unknown): SetupSaveResult => {
    const parsed = setupCreateArgsSchema.safeParse(args)
    if (!parsed.success) {
      if (args === null || typeof args !== 'object') return { ok: false, reason: 'write-failed' }
      if (typeof (args as Record<string, unknown>).name !== 'string') {
        return { ok: false, reason: 'invalid-name' }
      }
      return { ok: false, reason: 'write-failed' }
    }
    return createSetup(parsed.data)
  })

  ipcMain.handle('setups:update', (_e, id: string, args: unknown): SetupSaveResult => {
    if (typeof id !== 'string') return { ok: false, reason: 'setup-not-found' }
    if (!args || typeof args !== 'object') return { ok: false, reason: 'write-failed' }
    const data: Partial<{
      name: string
      bike_id: string
      bike_paint: string
      rider: string
      helmet: string
      helmet_paint: string
      suit_paint: string
      riding_style: string
    }> = {}
    const allowed = [
      'name',
      'bike_id',
      'bike_paint',
      'rider',
      'helmet',
      'helmet_paint',
      'suit_paint',
      'riding_style'
    ] as const
    for (const key of allowed) {
      if (!(key in (args as Record<string, unknown>))) continue
      const value = (args as Record<string, unknown>)[key]
      if (typeof value !== 'string') return { ok: false, reason: 'write-failed' }
      data[key] = value
    }
    return updateSetup(id, data)
  })

  ipcMain.handle('setups:delete', (_e, id: string): SetupDeleteResult => {
    if (typeof id !== 'string') return { ok: false, reason: 'setup-not-found' }
    return deleteSetup(id)
  })

  ipcMain.handle('setups:select', (_e, id: string | null): SetupSelectResult => {
    if (id !== null && typeof id !== 'string') return { ok: false, reason: 'setup-not-found' }
    return applySetup(id)
  })

  ipcMain.handle('validate:app', () => validateApp())

  ipcMain.handle('app:get-version', () => getAppVersion())
  ipcMain.handle('launcher:reset', () => {
    resetLauncher()
    void refreshModsWatcher()
  })
  ipcMain.handle('updater:check', () => checkForUpdates())
  ipcMain.handle('updater:download', () => downloadUpdate())
  ipcMain.handle('updater:install', () => installUpdate())
  ipcMain.handle('updater:get-status', () => getUpdaterStatus())
}

function registerLocalFileProtocolHandler(): void {
  protocol.handle('local-file', async (request) => {
    try {
      const decision = resolveLocalFilePath(getResolvedModsPath(), new URL(request.url).pathname)
      if (!decision.ok) return new Response(null, { status: 403 })
      try {
        const stats = await fs.stat(decision.path)
        if (!stats.isFile()) return new Response(null, { status: 404 })
      } catch {
        return new Response(null, { status: 404 })
      }
      try {
        return await net.fetch(pathToFileURL(decision.path).toString())
      } catch {
        return new Response(null, { status: 404 })
      }
    } catch {
      return new Response(null, { status: 403 })
    }
  })
}

function broadcastModsDiff(message: ModChangedMessage): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('mods:changed', message)
  }
}

registerAppIpcHandlers()

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.gsvr.kneedown')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialization uses exactly the persisted Electron Store values.
  // No path auto-detection is triggered here; detection only runs
  // on demand via 'paths:detect' (Auto Detect).
  // The mods init awaits Store + path validation before the window exists,
  // so the first mods:getAll never runs on an unvalidated path. The disk
  // reconcile stays in the background; the watcher starts before it so
  // live events never lose to a stale full scan.
  registerLocalFileProtocolHandler()
  await initModsWatcher(broadcastModsDiff)
  const initialWindow = createWindow()

  registerUpdater(initialWindow)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      registerUpdater(createWindow())
    }
  })
})

app.on('before-quit', () => {
  flushModsCache()
  void stopModsWatcher()
  stopUpdaterChecks()
})

// A boot that saw a null path leaves no watcher: revalidate on focus to
// start the watcher when the path becomes valid again (refreshModsWatcher).
// Then the disk id gate avoids repeated scans when nothing changed
// (refreshByFocus). refreshByFocus is a no-op when the id list is unchanged.
app.on('browser-window-focus', async () => {
  void refreshModsWatcher()
  await refreshByFocus()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
