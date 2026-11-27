import type { KaraokeSongAsset } from '@proj-airi/stage-shared/karaoke'

import { tool } from '@xsai/tool'
import { z } from 'zod'

import { useKaraokeStore } from '../stores/karaoke'
import { useKaraokePlayerStore } from '../stores/karaoke-player'

export { useKaraokePlayerStore, useKaraokeStore }

/** Treats "any song", "you pick", an empty string and friends as "no title". */
const NO_TITLE = /^\s*(?:any|any\s+song|anything|whatever|random|surprise|something|your\s+choice|you\s+pick|don'?t\s+care|none|no)\s*$/i

export function normaliseSongRequest(song?: string): string | undefined {
  const wanted = (song ?? '').trim()
  if (!wanted || NO_TITLE.test(wanted))
    return undefined
  return wanted
}

/** Picks the song to perform; `null` when the library is empty. */
export function pickSong(songs: KaraokeSongAsset[], requested?: string): KaraokeSongAsset | null {
  if (songs.length === 0)
    return null

  const wanted = normaliseSongRequest(requested)?.toLowerCase()
  if (wanted) {
    return songs.find(song => song.name.toLowerCase().includes(wanted))
      ?? songs.find(song => song.id.toLowerCase().includes(wanted))
      ?? songs[Math.floor(Math.random() * songs.length)]
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
      song: z.string().describe(
        'Title or part of the title, or "any" to let you choose. Always pass a value; never omit it.',
      ),
    }),
    execute: async ({ song }) => {
      const karaoke = useKaraokeStore()
      const player = useKaraokePlayerStore()

      // Prefer an explicit id: whichever window can list the library resolves the
      // song, and the stage window only has to play it. When this window cannot
      // list either, the stage resolves the request against its own library.
      if (karaoke.songs.length === 0)
        await karaoke.refresh()
      if (karaoke.songs.length === 0)
        karaoke.restoreCachedSongs()
      const wanted = normaliseSongRequest(song)
      const chosen = pickSong(karaoke.songs, wanted)

      // The stage starts the song once the reply has been spoken; `requestSing`
      // carries an id when this window could resolve one, else the query.
      await player.requestSing(wanted, chosen?.id)

      await new Promise(resolve => setTimeout(resolve, 1800))

      const state = player.activeState
      const result = state?.error
        ? `The stage could not sing: ${state.error}`
        : state?.isPlaying
          ? `Now singing${chosen ? ` "${chosen.name}"` : wanted ? ` "${wanted}"` : ''}.`
          : 'I queued the song and start it as soon as I finish talking.'
      return result
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
/**
 * The singer tools, created for one chat request.
 *
 * `stores/chat.ts` adds them unconditionally, next to the wake-word tool: a
 * registration in the synced tool store does not reach the request, and the
 * singer has to work without the owner selecting it first. Without a karaoke
 * store (unit tests, headless callers) they resolve to nothing instead of
 * breaking the request.
 */
export async function createKaraokeTools() {
  try {
    useKaraokeStore()
    useKaraokePlayerStore()
  }
  catch {
    return []
  }
  return Promise.all(tools)
}

/** Alias used by `resolveLlmTools`. */
export const karaoke = createKaraokeTools
