import type { KaraokeSongAsset } from '@proj-airi/stage-shared/karaoke'

import { describe, expect, it } from 'vitest'

import { normaliseSongRequest, pickSong } from './karaoke'

function song(id: string, name: string): KaraokeSongAsset {
  return {
    id,
    name,
    size: 1,
    importedAt: '2026-01-01T00:00:00.000Z',
    durationSec: 1,
    hasLyrics: true,
    hasVisemes: true,
    hasStems: true,
  }
}

const library = [
  song('stone-temple-pilots-interstate-love-song', 'Stone Temple Pilots - Interstate Love Song'),
  song('mötley-crüe-kickstart-my-heart', 'Mötley Crüe - Kickstart My Heart'),
]

describe('pickSong', () => {
  it('picks by a fragment of the title, case-insensitively', () => {
    expect(pickSong(library, 'kickstart')?.id).toBe('mötley-crüe-kickstart-my-heart')
    expect(pickSong(library, 'INTERSTATE')?.id).toBe('stone-temple-pilots-interstate-love-song')
  })

  it('falls back to the id when the title does not contain the words', () => {
    expect(pickSong(library, 'mötley')?.id).toBe('mötley-crüe-kickstart-my-heart')
  })

  it('returns null only when the library is empty', () => {
    expect(pickSong([], 'anything')).toBeNull()
    expect(pickSong([])).toBeNull()
  })

  it('falls back to some installed song when the title matches nothing or says "any"', () => {
    const ids = library.map(entry => entry.id)
    for (const request of ['nothing like this', 'any', 'any song', '', 'you pick']) {
      for (let attempt = 0; attempt < 10; attempt++)
        expect(ids).toContain(pickSong(library, request)?.id)
    }
  })

  it('treats a free-choice answer as no title', () => {
    expect(normaliseSongRequest('ANY')).toBeUndefined()
    expect(normaliseSongRequest('you pick')).toBeUndefined()
    expect(normaliseSongRequest('   ')).toBeUndefined()
    expect(normaliseSongRequest('plush')).toBe('plush')
  })

  it('chooses one of the installed songs when no title is given', () => {
    for (let attempt = 0; attempt < 20; attempt++)
      expect(library.map(entry => entry.id)).toContain(pickSong(library)?.id)
  })
})
