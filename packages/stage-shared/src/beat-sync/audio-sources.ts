import type { BeatSyncAudioSource } from './audio-capture'

import { isStageTamagotchi } from '../environment'
import { isElectronWindow } from '../window'
import { beatSyncAudioCaptureListSourcesChannel } from './audio-capture'

/** The only system-audio source available outside Linux's PulseAudio source list. */
const systemAudioSource: BeatSyncAudioSource = {
  id: 'system',
  label: 'System audio (screen capture)',
  kind: 'system',
  description: 'Captured through Electron desktop audio',
}

/**
 * Lists audio sources that Beat Sync can use.
 *
 * Linux uses PulseAudio/PipeWire sources so monitors and microphones are both visible. Other runtimes
 * keep the existing desktop-capture audio path and expose it as one explicit source.
 */
export async function listBeatSyncAudioSources(): Promise<BeatSyncAudioSource[]> {
  if (isStageTamagotchi() && isElectronWindow(window) && window.platform === 'linux')
    return window.electron.ipcRenderer.invoke(beatSyncAudioCaptureListSourcesChannel)

  return [systemAudioSource]
}
