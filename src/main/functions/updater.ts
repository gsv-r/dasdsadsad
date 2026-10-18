import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

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

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let mainWindow: BrowserWindow | null = null
let listenersAttached = false
let lastStatus: UpdaterStatus = { status: 'idle' }
let checkTimer: NodeJS.Timeout | null = null
let isChecking = false
let isDownloading = false
let availableVersion: string | null = null
let downloadedVersion: string | null = null

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function sendStatus(status: UpdaterStatus): void {
  lastStatus = status
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', status)
  }
}

function attachListeners(): void {
  if (listenersAttached) return
  listenersAttached = true

  // Public anonymous feed (repo gsv-r/knee-down, see electron-builder.yml).
  // No token or requestHeaders here: the production app only performs
  // anonymous GETs on latest.yml + installer/.blockmap. The publishing PAT
  // (UPDATE_REPO_TOKEN) exists only in CI and is never embedded in the build.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendStatus({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    isChecking = false
    availableVersion = info.version
    // A new version invalidates a previously downloaded (stale) one.
    if (downloadedVersion && downloadedVersion !== info.version) {
      downloadedVersion = null
    }
    sendStatus({ status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    isChecking = false
    availableVersion = null
    sendStatus({ status: 'up-to-date' })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendStatus({
      status: 'downloading',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    isDownloading = false
    downloadedVersion = info.version
    sendStatus({ status: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    isChecking = false
    isDownloading = false
    const message = toMessage(err)
    console.error('[updater]', message)
    sendStatus({ status: 'error', message })
  })
}

function startPeriodicChecks(): void {
  if (checkTimer) return
  checkTimer = setInterval(() => {
    void checkForUpdates().catch(() => {
      // Error status was already broadcast; interval must never reject.
    })
  }, CHECK_INTERVAL_MS)
  if (typeof checkTimer.unref === 'function') checkTimer.unref()
}

export function registerUpdater(window: BrowserWindow): void {
  mainWindow = window
  attachListeners()

  window.once('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  // Listeners work in dev, but scheduled checks only run in packaged builds.
  if (!app.isPackaged) return

  // Wait for the renderer to be ready, otherwise the first
  // `updater:status` events are sent before `onStatus` is subscribed.
  // `getUpdaterStatus` replays `lastStatus` for late subscribers anyway.
  window.webContents.once('did-finish-load', () => {
    void checkForUpdates().catch(() => {})
    startPeriodicChecks()
  })
}

export function getUpdaterStatus(): UpdaterStatus {
  return { ...lastStatus }
}

export function stopUpdaterChecks(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}

function requirePackaged(): void {
  if (!app.isPackaged) {
    throw new Error('Auto-update is only available in packaged builds.')
  }
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()

  // Dev has no update feed. Report "no update" instead of throwing so the
  // manual "check updates" button stays quiet outside packaged builds.
  if (!app.isPackaged) {
    sendStatus({ status: 'up-to-date' })
    return { currentVersion, latestVersion: null, updateAvailable: false }
  }

  if (isChecking) {
    throw new Error('Update check already in progress.')
  }

  isChecking = true
  sendStatus({ status: 'checking' })

  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result || !result.isUpdateAvailable) {
      // Sync state with the result instead of relying only on events,
      // so a subsequent downloadUpdate() never sees a stale version.
      availableVersion = null
      return {
        currentVersion,
        latestVersion: result?.updateInfo?.version ?? null,
        updateAvailable: false
      }
    }
    // Same: make the guard state explicit even if the event already fired.
    availableVersion = result.updateInfo.version
    if (downloadedVersion && downloadedVersion !== availableVersion) {
      downloadedVersion = null
    }
    return {
      currentVersion,
      latestVersion: result.updateInfo.version,
      updateAvailable: true
    }
  } catch (err) {
    const message = toMessage(err)
    console.error('[updater] check failed:', message)
    sendStatus({ status: 'error', message })
    throw new Error(message, { cause: err })
  } finally {
    isChecking = false
  }
}

export async function downloadUpdate(): Promise<void> {
  requirePackaged()

  if (isDownloading) {
    throw new Error('Update download already in progress.')
  }
  if (downloadedVersion) {
    throw new Error('Update already downloaded.')
  }
  if (!availableVersion) {
    throw new Error('No update available to download.')
  }

  isDownloading = true
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    isDownloading = false
    const message = toMessage(err)
    console.error('[updater] download failed:', message)
    sendStatus({ status: 'error', message })
    throw new Error(message, { cause: err })
  }
}

export function installUpdate(): void {
  if (!downloadedVersion) {
    throw new Error('No downloaded update to install.')
  }
  // isSilent=false keeps the assisted NSIS UI; isForceRunAfter=true
  // restarts the app after the install (validates the reboot flow).
  autoUpdater.quitAndInstall(false, true)
}

export function getAppVersion(): string {
  return app.getVersion()
}
