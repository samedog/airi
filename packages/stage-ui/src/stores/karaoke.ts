import type { KaraokeManifest, KaraokeSongAsset, KaraokeSongFile } from '@proj-airi/stage-shared/karaoke'

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

  async function refresh() {
    if (!supported.value) {
      songs.value = []
      return
    }

    loading.value = true
    error.value = undefined
    try {
      songs.value = await defineInvoke(getContext(), electronKaraokeSongsList)()
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

  async function read(id: string, file: KaraokeSongFile) {
    return defineInvoke(getContext(), electronKaraokeSongRead)({ id, file })
  }

  async function getAudioUrl(id: string): Promise<string | undefined> {
    if (!supported.value)
      return undefined
    const cached = audioUrls.get(id)
    if (cached)
      return cached
    const pending = urlRequests.get(id)
    if (pending)
      return pending

    const request = (async () => {
      try {
        const buffer = await read(id, 'audio')
        const url = URL.createObjectURL(new Blob([buffer]))
        audioUrls.set(id, url)
        return url
      }
      catch (cause) {
        error.value = errorMessageFrom(cause)
        return undefined
      }
      finally {
        urlRequests.delete(id)
      }
    })()
    urlRequests.set(id, request)
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
    getAudioUrl,
    getText,
    getManifest,
    removeSong,
    reveal,
    selectSong,
  }
})
