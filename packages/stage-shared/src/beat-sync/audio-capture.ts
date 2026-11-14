/**
 * IPC contract used by the Linux Beat Sync system-audio fallback.
 *
 * Electron's screen-capture audio loopback is not reliable on PipeWire, so the main process records the
 * explicitly selected monitor or microphone source with `parec` and forwards raw PCM to the hidden Beat
 * Sync renderer.
 */
export const beatSyncAudioCaptureListSourcesChannel = 'airi:beat-sync:audio-capture:list-sources'
export const beatSyncAudioCaptureStartChannel = 'airi:beat-sync:audio-capture:start'
export const beatSyncAudioCaptureStopChannel = 'airi:beat-sync:audio-capture:stop'
export const beatSyncAudioCaptureChunkChannel = 'airi:beat-sync:audio-capture:chunk'

export const beatSyncAudioCaptureSampleRate = 48_000
export const beatSyncAudioCaptureChannels = 2

export type BeatSyncAudioSourceKind = 'monitor' | 'input' | 'system'

export interface BeatSyncAudioSource {
  id: string
  label: string
  kind: BeatSyncAudioSourceKind
  description?: string
}

export interface BeatSyncAudioCaptureStartRequest {
  sourceId: string
}

export interface BeatSyncAudioCaptureDescription {
  sampleRate: number
  channels: number
  source: BeatSyncAudioSource
}

export interface BeatSyncToggleRequest {
  enabled: boolean
  sourceId?: string
}
