import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { BrowserWindow } from 'electron'

import { baseUrl, getPreloadPath, getRendererRoot, load } from '../../libs/electron/location'
import { excludeWindowFromTaskbar } from '../shared/app-icon'
import { protectPrivilegedWindowNavigation } from '../shared/window'
import { setupBeatSyncAudioCapture } from './system-audio-capture'

/** Creates the hidden renderer that owns the Beat Sync capture and detector. */
export async function setupBeatSync() {
  const window = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: getPreloadPath('beat-sync'),
      sandbox: false,
    },
  })

  excludeWindowFromTaskbar(window)
  protectPrivilegedWindowNavigation(window)

  setupBeatSyncAudioCapture(window)

  await load(window, baseUrl(getRendererRoot(), 'beat-sync.html'))
  initScreenCaptureForWindow(window)

  return window
}
