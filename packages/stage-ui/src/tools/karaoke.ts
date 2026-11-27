import type { KaraokeSongAsset } from '@proj-airi/stage-shared/karaoke'

import { tool } from '@xsai/tool'
import { z } from 'zod'

import { useKaraokeStore } from '../stores/karaoke'
import { useKaraokePlayerStore } from '../stores/karaoke-player'

function songLabel(song: KaraokeSongAsset) {
  return song.name
}

/**
 * Picks the song to sing.
 *
 * An explicit title (or a fragment of it) wins, so "sing Interstate" works.
 * Otherwise a random installed song is chosen, which is what "sing me a song"
 * expects. `null` means the library is empty.
 */
export function pickSong(songs: KaraokeSongAsset[], requested?: string): KaraokeSongAsset | null {
  if (songs.length === 0)
    return null

  const wanted = requested?.trim().toLowerCase()
  if (wanted) {
    const match = songs.find(song => songLabel(song).toLowerCase().includes(wanted))
      ?? songs.find(song => song.id.toLowerCase().includes(wanted))
    if (!match)
      return null
    return match
  }

  return songs[Math.floor(Math.random() * songs.length)]
}

const tools = [
  tool({
    name: 'builtIn_singSong',
    description: [
      'Sing a karaoke song that is installed in the app: the character performs it on stage with',
      'the lyrics, the backing track and lip sync. Use this whenever the owner asks you to sing,',
      'or to sing a particular song by name. Do not claim you are singing without calling it.',
    ].join(' '),
    parameters: z.object({
      song: z.string().optional().describe('Title or part of the title. Omit to pick a song yourself.'),
    }),
    execute: async ({ song }) => {
      const karaoke = useKaraokeStore()
      const player = useKaraokePlayerStore()

      if (karaoke.songs.length === 0)
        await karaoke.refresh()

      const chosen = pickSong(karaoke.songs, song)
      if (!chosen) {
        const available = karaoke.songs.map(song => songLabel(song)).join(', ')
        return song
          ? `No installed karaoke song matches "${song}". Available: ${available || 'none'}.`
          : 'No karaoke songs are installed yet, so there is nothing to sing.'
      }

      if (player.isPlaying)
        player.requestStop()

      await player.requestPlay(chosen.id)
      return `Now singing "${songLabel(chosen)}".`
    },
  }),
  tool({
    name: 'builtIn_stopSong',
    description: 'Stop the karaoke song that is playing, for example when the owner asks you to stop singing.',
    parameters: z.object({}),
    execute: async () => {
      const player = useKaraokePlayerStore()
      if (!player.isPlaying)
        return 'Nothing is playing.'
      player.requestStop()
      return 'Stopped the song.'
    },
  }),
]

/**
 * The karaoke tools, or none when no karaoke store can be reached.
 *
 * The chat and the stage are often different windows: `requestPlay` posts
 * `{ type: 'play', songId }` over `airi-karaoke-playback-command` when this
 * renderer is not the stage host, so the tools must exist wherever the chat
 * runs. Only a missing Pinia (unit tests, headless callers) hides them.
 */
export async function karaoke() {
  try {
    useKaraokeStore()
    useKaraokePlayerStore()
  }
  catch {
    return []
  }
  return Promise.all(tools)
}
