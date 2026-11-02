import { useLogg } from '@guiiai/logg'
import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { app, BrowserWindow } from 'electron'

import { baseUrl, getPreloadPath, getRendererRoot, load } from '../../libs/electron/location'
import { excludeWindowFromTaskbar } from '../shared/app-icon'
import { protectPrivilegedWindowNavigation } from '../shared/window'
import { setupBeatSyncAudioCapture } from './system-audio-capture'

const log = useLogg('beat-sync-window').useGlobalConfig()

export interface BeatSyncWindowManager {
  /** Returns the live hidden window, if one exists. */
  getWindow: () => BrowserWindow | undefined
  /** Creates a new hidden window after close or renderer crash. */
  ensureWindow: () => Promise<BrowserWindow>
  /** Opens devtools for the current window, recreating it if needed. */
  openDevTools: () => Promise<void>
  /** Stops recovery and closes the window during application shutdown. */
  dispose: () => void
}

/** Creates the hidden renderer that owns the Beat Sync capture and detector. */
export async function setupBeatSync(): Promise<BeatSyncWindowManager> {
  let window: BrowserWindow | undefined
  let creating: Promise<BrowserWindow> | undefined
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  const createWindow = async () => {
    const next = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      webPreferences: {
        preload: getPreloadPath('beat-sync'),
        sandbox: false,
        // The hidden detector uses a timer for the 30 Hz vibe meter.
        backgroundThrottling: false,
      },
    })

    try {
      excludeWindowFromTaskbar(next)
      protectPrivilegedWindowNavigation(next)
      setupBeatSyncAudioCapture(next)
      await load(next, baseUrl(getRendererRoot(), 'beat-sync.html'))
      initScreenCaptureForWindow(next)
    }
    catch (error) {
      if (!next.isDestroyed())
        next.destroy()
      throw error instanceof Error ? error : new Error(String(error))
    }

    next.on('closed', () => {
      if (window === next)
        window = undefined
      scheduleRecovery('closed')
    })
    next.webContents.on('render-process-gone', (_event, details) => {
      if (disposed)
        return
      log.withFields({ reason: details.reason, exitCode: details.exitCode }).warn('Beat Sync renderer exited; recreating')
      if (window === next)
        window = undefined
      if (!next.isDestroyed())
        next.destroy()
      scheduleRecovery('render-process-gone')
    })

    window = next
    return next
  }

  const ensureWindow = async () => {
    if (window && !window.isDestroyed())
      return window
    if (creating)
      return creating

    creating = createWindow().finally(() => {
      creating = undefined
    })
    return creating
  }

  function scheduleRecovery(reason: string) {
    if (disposed || recoveryTimer)
      return

    recoveryTimer = setTimeout(() => {
      recoveryTimer = undefined
      if (disposed)
        return
      void ensureWindow()
        .then(() => log.withFields({ reason }).log('Beat Sync window recovered'))
        .catch(error => log.withError(error).error('Failed to recover Beat Sync window'))
    }, 1000)
  }

  app.once('before-quit', () => {
    disposed = true
    if (recoveryTimer)
      clearTimeout(recoveryTimer)
    recoveryTimer = undefined
  })

  await ensureWindow()

  return {
    getWindow: () => window,
    ensureWindow,
    async openDevTools() {
      const next = await ensureWindow()
      next.webContents.openDevTools({ mode: 'detach' })
    },
    dispose() {
      disposed = true
      if (recoveryTimer)
        clearTimeout(recoveryTimer)
      recoveryTimer = undefined
      if (window && !window.isDestroyed())
        window.destroy()
      window = undefined
    },
  }
}
