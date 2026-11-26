import { defineInvokeEventa } from '@moeru/eventa'

/** Media files a karaoke song package may carry, besides its manifest. */
export const karaokeSongAssetFiles = ['audio', 'lyrics', 'visemes', 'vocal', 'instrumental'] as const
export type KaraokeSongAssetFile = typeof karaokeSongAssetFiles[number]

/** Every readable file of a song package. */
export type KaraokeSongFile = 'manifest' | KaraokeSongAssetFile

export const KARAOKE_MANIFEST_FILE = 'manifest.json'

/**
 * The manifest of one karaoke song package.
 *
 * A package is a folder with this manifest and the files it names. The app only
 * reads it; any producer can write one.
 */
export interface KaraokeManifest {
  version?: number
  title: string
  artist?: string
  /** Length of the mixed audio, in seconds. Falls back to the WAV header. */
  durationSec?: number
  bpm?: number
  /** Mixed vocal + instrumental. Required. */
  audio: string
  /** Enhanced LRC with word timings. */
  lyrics?: string
  /** `[{ t, d, v }]` viseme timeline. */
  visemes?: string
  vocal?: string
  instrumental?: string
  /** How late the vocal stem starts inside the mix, in milliseconds. */
  vocalOffsetMs?: number
  dance?: { clip?: string, bpm?: number }
}

/** One song in the desktop karaoke library. */
export interface KaraokeSongAsset {
  id: string
  name: string
  size: number
  importedAt: string
  durationSec: number
  bpm?: number
  hasLyrics: boolean
  hasVisemes: boolean
  hasStems: boolean
}

/** Commands the settings window sends to the stage window, which owns playback. */
export const KARAOKE_PLAYBACK_COMMAND_CHANNEL = 'airi-karaoke-playback-command'
/** Playback state that the stage window reports back to the settings window. */
export const KARAOKE_PLAYBACK_STATE_CHANNEL = 'airi-karaoke-playback-state'

export type KaraokePlaybackCommand = { type: 'play', songId: string } | { type: 'stop' }

export interface KaraokePlaybackState {
  isPlaying: boolean
  songId?: string
  currentTime: number
  duration: number
  /** Last failure reported by the stage window. */
  error?: string
}

export const electronKaraokeSongsList = defineInvokeEventa<KaraokeSongAsset[]>(
  'eventa:invoke:electron:karaoke:songs:list',
)

export const electronKaraokeSongRead = defineInvokeEventa<ArrayBuffer, { id: string, file: KaraokeSongFile }>(
  'eventa:invoke:electron:karaoke:song:read',
)

export const electronKaraokeSongRemove = defineInvokeEventa<void, string>(
  'eventa:invoke:electron:karaoke:song:remove',
)

export const electronKaraokeSongReveal = defineInvokeEventa<void>(
  'eventa:invoke:electron:karaoke:song:reveal',
)

const PLAIN_FILE_NAME = /^[^/\\]+$/

function isPlainFileName(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 200
    && value !== '.'
    && value !== '..'
    && value !== KARAOKE_MANIFEST_FILE
    && PLAIN_FILE_NAME.test(value)
}

/** True for an id that can safely become a folder name. */
export function isSafeKaraokeSongId(id: string): boolean {
  return typeof id === 'string'
    && id.length > 0
    && id.length <= 120
    && id !== '.'
    && id !== '..'
    && PLAIN_FILE_NAME.test(id)
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** Validates a parsed `manifest.json`. */
export function isKaraokeManifest(value: unknown): value is KaraokeManifest {
  if (!value || typeof value !== 'object')
    return false
  const manifest = value as Partial<KaraokeManifest>
  return typeof manifest.title === 'string'
    && manifest.title.trim().length > 0
    && manifest.title.length <= 200
    && isPlainFileName(manifest.audio)
    && (manifest.lyrics === undefined || isPlainFileName(manifest.lyrics))
    && (manifest.visemes === undefined || isPlainFileName(manifest.visemes))
    && (manifest.vocal === undefined || isPlainFileName(manifest.vocal))
    && (manifest.instrumental === undefined || isPlainFileName(manifest.instrumental))
    && (manifest.vocalOffsetMs === undefined || (typeof manifest.vocalOffsetMs === 'number' && Number.isFinite(manifest.vocalOffsetMs) && manifest.vocalOffsetMs >= 0))
    && (manifest.durationSec === undefined || isPositiveNumber(manifest.durationSec))
    && (manifest.bpm === undefined || isPositiveNumber(manifest.bpm))
}

/** The manifest field that names one asset file. */
export function karaokeFileFor(manifest: KaraokeManifest, file: KaraokeSongAssetFile): string | undefined {
  return manifest[file]
}

function readAscii(view: DataView, offset: number, length: number): string {
  let text = ''
  for (let index = 0; index < length && offset + index < view.byteLength; index += 1)
    text += String.fromCharCode(view.getUint8(offset + index))
  return text
}

/**
 * Duration of a RIFF/WAVE buffer in seconds.
 *
 * The header alone is enough, so callers can read the first chunk of a large
 * file instead of the whole thing. Returns undefined for anything that is not a
 * readable WAVE file.
 */
export function wavDurationSec(bytes: ArrayBuffer): number | undefined {
  const view = new DataView(bytes)
  if (view.byteLength < 44 || readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE')
    return undefined

  let byteRate = 0
  let dataSize = 0
  let offset = 12
  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 'fmt ' && body + 12 <= view.byteLength) {
      byteRate = view.getUint32(body + 8, true)
    }
    else if (id === 'data') {
      dataSize = size
      break
    }
    if (size === 0)
      break
    offset = body + size + (size % 2)
  }

  if (byteRate <= 0 || dataSize <= 0)
    return undefined
  return dataSize / byteRate
}
