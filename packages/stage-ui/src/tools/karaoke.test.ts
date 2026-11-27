import type { KaraokeSongAsset } from '@proj-airi/stage-shared/karaoke'

import { describe, expect, it } from 'vitest'

import { pickSong } from './karaoke'

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

  it('returns null when nothing matches or the library is empty', () => {
    expect(pickSong(library, 'nothing like this')).toBeNull()
    expect(pickSong([], 'anything')).toBeNull()
    expect(pickSong([])).toBeNull()
  })

  it('chooses one of the installed songs when no title is given', () => {
    for (let attempt = 0; attempt < 20; attempt++)
      expect(library.map(entry => entry.id)).toContain(pickSong(library)?.id)
  })
})
