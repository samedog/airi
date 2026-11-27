import type { KaraokeManifest, KaraokeSongAsset, KaraokeSongAssetFile, KaraokeSongFile } from '@proj-airi/stage-shared/karaoke'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFrom } from '@moeru/std'
import { isElectronWindow } from '@proj-airi/stage-shared'
import {
  electronKaraokeSongRead,
  electronKaraokeSongRemove,
  electronKaraokeSongReveal,
  electronKaraokeSongsList,
} from '@proj-airi/stage-shared/karaoke'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * Reads the desktop karaoke library from the main process.
 *
 * Packages are folders under `userData/karaoke/songs/<id>/` with a manifest and
 * the audio, lyrics and viseme files it names. The settings window lists them
 * and the stage reads them back by id, the same way the VRM animation library
 * works. Both windows keep their own store and eventa context.
 */
export const useKaraokeStore = defineStore('karaoke', () => {
  const songs = ref<KaraokeSongAsset[]>([])
  const loading = ref(false)
  const error = ref<string>()
  const selectedSongId = useLocalStorage('settings/karaoke/selected-song', '')
  // The stage window can read a song by id but has been seen with an empty list,
  // so the newest successful listing is cached for it to fall back on.
  const cachedSongs = useLocalStorage<KaraokeSongAsset[]>('settings/karaoke/library-cache', [])
  const supported = computed(() => typeof window !== 'undefined' && isElectronWindow(window))
  const selectedSong = computed(() => songs.value.find(song => song.id === selectedSongId.value))

  const audioUrls = new Map<string, string>()
  const urlRequests = new Map<string, Promise<string | undefined>>()
  let context: ReturnType<typeof createContext> | undefined

  function getContext() {
    if (typeof window === 'undefined' || !isElectronWindow(window))
      throw new Error('The karaoke library requires the desktop app.')
    context ??= createContext(window.electron.ipcRenderer)
    return context.context
  }

  /** Freshest listing first, union by id: a window can see only part of the library. */
  function mergeCachedSongs(cached: KaraokeSongAsset[], fresh: KaraokeSongAsset[]): KaraokeSongAsset[] {
    const seen = new Set(fresh.map(song => song.id))
    return [...fresh, ...cached.filter(song => !seen.has(song.id))]
  }

  async function refresh() {
    if (!supported.value) {
      songs.value = []
      return
    }

    loading.value = true
    error.value = undefined
    try {
      songs.value = await defineInvoke(getContext(), electronKaraokeSongsList)()
      if (songs.value.length > 0) {
        // A window can see only part of the library (the stage has been seen with
        // one song while settings lists three). Merge with the cache instead of
        // replacing it, so every window picks from the same list.
        const merged = mergeCachedSongs(cachedSongs.value, songs.value)
        if (merged.length !== songs.value.length)
          songs.value = merged
        cachedSongs.value = merged
      }
      if (selectedSongId.value && !songs.value.some(song => song.id === selectedSongId.value))
        selectedSongId.value = ''
    }
    catch (cause) {
      error.value = errorMessageFrom(cause)
    }
    finally {
      loading.value = false
    }
  }

  /** Uses the last listing another window made, for a window whose own listing failed. */
  function restoreCachedSongs() {
    if (songs.value.length === 0 && cachedSongs.value.length > 0)
      songs.value = cachedSongs.value
  }

  async function read(id: string, file: KaraokeSongFile) {
    return defineInvoke(getContext(), electronKaraokeSongRead)({ id, file })
  }

  async function getAudioUrl(id: string, file: KaraokeSongAssetFile = 'audio'): Promise<string | undefined> {
    if (!supported.value)
      return undefined
    const key = `${id}:${file}`
    const cached = audioUrls.get(key)
    if (cached)
      return cached
    const pending = urlRequests.get(key)
    if (pending)
      return pending

    const request = (async () => {
      try {
        const buffer = await read(id, file)
        const url = URL.createObjectURL(new Blob([buffer]))
        audioUrls.set(key, url)
        return url
      }
      catch {
        return undefined
      }
      finally {
        urlRequests.delete(key)
      }
    })()
    urlRequests.set(key, request)
    return request
  }

  async function getText(id: string, file: KaraokeSongFile): Promise<string | undefined> {
    if (!supported.value)
      return undefined
    try {
      return new TextDecoder().decode(await read(id, file))
    }
    catch {
      return undefined
    }
  }

  async function getManifest(id: string): Promise<KaraokeManifest | undefined> {
    const text = await getText(id, 'manifest')
    if (!text)
      return undefined
    try {
      return JSON.parse(text) as KaraokeManifest
    }
    catch {
      return undefined
    }
  }

  async function removeSong(id: string) {
    if (!supported.value)
      return
    await defineInvoke(getContext(), electronKaraokeSongRemove)(id)
    const url = audioUrls.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      audioUrls.delete(id)
    }
    songs.value = songs.value.filter(song => song.id !== id)
    cachedSongs.value = cachedSongs.value.filter(song => song.id !== id)
    if (selectedSongId.value === id)
      selectedSongId.value = ''
  }

  async function reveal() {
    if (!supported.value)
      return
    await defineInvoke(getContext(), electronKaraokeSongReveal)()
  }

  function selectSong(id: string) {
    selectedSongId.value = id
  }

  return {
    songs,
    loading,
    error,
    supported,
    selectedSongId,
    selectedSong,
    refresh,
    restoreCachedSongs,
    getAudioUrl,
    getText,
    getManifest,
    removeSong,
    reveal,
    selectSong,
  }
})
