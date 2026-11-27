import { describe, expect, it } from 'vitest'

import { isKaraokeManifest, isSafeKaraokeSongId, karaokeFileFor, wavDurationSec } from './karaoke'

function wavHeader(options: { sampleRate?: number, channels?: number, bits?: number, dataSize?: number } = {}) {
  const sampleRate = options.sampleRate ?? 24000
  const channels = options.channels ?? 1
  const bits = options.bits ?? 16
  const dataSize = options.dataSize ?? 48000 * 10
  const byteRate = sampleRate * channels * bits / 8
  const buffer = new ArrayBuffer(44)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1)
      view.setUint8(offset + index, text.charCodeAt(index))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, channels * bits / 8, true)
  view.setUint16(34, bits, true)
  write(36, 'data')
  view.setUint32(40, dataSize, true)
  return buffer
}

describe('karaoke manifest', () => {
  it('accepts a package with audio only', () => {
    expect(isKaraokeManifest({ title: 'Song', audio: 'mix.wav' })).toBe(true)
  })

  it('accepts the optional files and metadata', () => {
    expect(isKaraokeManifest({
      title: 'Song',
      audio: 'mix.wav',
      lyrics: 'lyrics.lrc',
      visemes: 'visemes.json',
      vocal: 'vocal.wav',
      instrumental: 'instrumental.wav',
      durationSec: 175.3,
      bpm: 397.7,
    })).toBe(true)
  })

  it('rejects unsafe file names', () => {
    expect(isKaraokeManifest({ title: 'Song', audio: '../mix.wav' })).toBe(false)
    expect(isKaraokeManifest({ title: 'Song', audio: 'mix.wav', lyrics: 'sub/lyrics.lrc' })).toBe(false)
    expect(isKaraokeManifest({ title: 'Song', audio: 'manifest.json' })).toBe(false)
  })

  it('rejects missing or invalid fields', () => {
    expect(isKaraokeManifest(null)).toBe(false)
    expect(isKaraokeManifest({ audio: 'mix.wav' })).toBe(false)
    expect(isKaraokeManifest({ title: '   ', audio: 'mix.wav' })).toBe(false)
    expect(isKaraokeManifest({ title: 'Song', audio: 'mix.wav', bpm: -1 })).toBe(false)
    expect(isKaraokeManifest({ title: 'Song', audio: 'mix.wav', durationSec: 0 })).toBe(false)
  })

  it('maps asset kinds to manifest fields', () => {
    const manifest = { title: 'Song', audio: 'mix.wav', lyrics: 'lyrics.lrc', visemes: 'visemes.json' }
    expect(karaokeFileFor(manifest, 'audio')).toBe('mix.wav')
    expect(karaokeFileFor(manifest, 'lyrics')).toBe('lyrics.lrc')
    expect(karaokeFileFor(manifest, 'visemes')).toBe('visemes.json')
    expect(karaokeFileFor(manifest, 'vocal')).toBeUndefined()
  })

  it('validates folder ids', () => {
    expect(isSafeKaraokeSongId('interstate-love-song')).toBe(true)
    expect(isSafeKaraokeSongId('..')).toBe(false)
    expect(isSafeKaraokeSongId('a/b')).toBe(false)
    expect(isSafeKaraokeSongId('')).toBe(false)
  })
})

describe('wavDurationSec', () => {
  it('reads the duration from the header', () => {
    expect(wavDurationSec(wavHeader({ dataSize: 48000 * 10 }))).toBe(10)
  })

  it('accounts for channels and bit depth', () => {
    expect(wavDurationSec(wavHeader({ sampleRate: 44100, channels: 2, bits: 16, dataSize: 44100 * 2 * 2 * 5 }))).toBe(5)
  })

  it('returns undefined for non-wav data', () => {
    expect(wavDurationSec(new ArrayBuffer(44))).toBeUndefined()
    expect(wavDurationSec(new ArrayBuffer(4))).toBeUndefined()
  })
})
