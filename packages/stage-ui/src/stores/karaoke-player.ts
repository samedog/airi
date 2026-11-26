import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'

import { useAudioContext } from './audio'

/**
 * Plays one karaoke song through the shared audio graph.
 *
 * The gain node is exposed so the stage can route the same signal into its
 * lip-sync node and analyser; the settings page can preview a song before the
 * stage wiring exists.
 */
export const useKaraokePlayerStore = defineStore('karaoke-player', () => {
  const { audioContext } = useAudioContext()
  const volume = useLocalStorage('settings/karaoke/volume', 0.9)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const songId = ref<string>()
  const gain = shallowRef<GainNode>()

  let source: AudioBufferSourceNode | undefined
  let startedAt = 0
  let frame = 0
  let stopping = false

  function ensureGain(): GainNode {
    if (gain.value)
      return gain.value
    const node = audioContext.createGain()
    node.gain.value = volume.value
    node.connect(audioContext.destination)
    gain.value = node
    return node
  }

  watch(volume, (next) => {
    if (gain.value)
      gain.value.gain.value = next
  })

  function tick() {
    if (!isPlaying.value)
      return
    currentTime.value = Math.min(duration.value, Math.max(0, audioContext.currentTime - startedAt))
    frame = requestAnimationFrame(tick)
  }

  function stop() {
    stopping = true
    cancelAnimationFrame(frame)
    frame = 0
    try {
      source?.stop()
    }
    catch {
      // Already stopped.
    }
    source?.disconnect()
    source = undefined
    isPlaying.value = false
    currentTime.value = 0
    songId.value = undefined
    stopping = false
  }

  async function play(id: string, url: string) {
    stop()
    await audioContext.resume()
    const response = await fetch(url)
    const buffer = await audioContext.decodeAudioData(await response.arrayBuffer())

    const node = audioContext.createBufferSource()
    node.buffer = buffer
    node.connect(ensureGain())
    node.onended = () => {
      if (!stopping)
        stop()
    }

    startedAt = audioContext.currentTime + 0.05
    node.start(startedAt)
    source = node
    duration.value = buffer.duration
    currentTime.value = 0
    songId.value = id
    isPlaying.value = true
    tick()
  }

  return {
    isPlaying,
    currentTime,
    duration,
    songId,
    volume,
    gain,
    play,
    stop,
  }
})
