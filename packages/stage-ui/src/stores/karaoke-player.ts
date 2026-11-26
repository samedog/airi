import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'

import { useAudioContext } from './audio'
import { useKaraokeStore } from './karaoke'

/**
 * Plays one karaoke song through the shared audio graph.
 *
 * Two outputs are kept apart: the mix goes to the speakers, while the vocal
 * stem (or the mix when no stem exists) feeds the lip-sync taps that the stage
 * connects. That way the mouth follows the voice rather than the drums.
 */
export const useKaraokePlayerStore = defineStore('karaoke-player', () => {
  const { audioContext } = useAudioContext()
  const karaoke = useKaraokeStore()
  const volume = useLocalStorage('settings/karaoke/volume', 0.9)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const songId = ref<string>()
  const mixGain = shallowRef<GainNode>()
  const lipGain = shallowRef<GainNode>()

  const sinks = new Set<AudioNode>()
  let mixSource: AudioBufferSourceNode | undefined
  let lipSource: AudioBufferSourceNode | undefined
  let startedAt = 0
  let frame = 0
  let stopping = false

  function ensureMixGain(): GainNode {
    if (mixGain.value)
      return mixGain.value
    const node = audioContext.createGain()
    node.gain.value = volume.value
    node.connect(audioContext.destination)
    mixGain.value = node
    return node
  }

  function ensureLipGain(): GainNode {
    if (lipGain.value)
      return lipGain.value
    const node = audioContext.createGain()
    node.gain.value = 1
    for (const sink of sinks)
      node.connect(sink)
    lipGain.value = node
    return node
  }

  /**
   * Connects a lip-sync node or analyser to the karaoke voice signal.
   *
   * Mirrors `voice.connectSpeechNode`: the returned function disconnects this
   * sink only, and taps added before the first song are connected on start.
   */
  function connectOutput(node: AudioNode): () => void {
    sinks.add(node)
    lipGain.value?.connect(node)
    return () => {
      sinks.delete(node)
      try {
        lipGain.value?.disconnect(node)
      }
      catch {
        // Already disconnected.
      }
    }
  }

  watch(volume, (next) => {
    if (mixGain.value)
      mixGain.value.gain.value = next
  })

  function tick() {
    if (!isPlaying.value)
      return
    currentTime.value = Math.min(duration.value, Math.max(0, audioContext.currentTime - startedAt))
    frame = requestAnimationFrame(tick)
  }

  function stopSources() {
    stopping = true
    for (const source of [mixSource, lipSource]) {
      try {
        source?.stop()
      }
      catch {
        // Already stopped.
      }
      source?.disconnect()
    }
    mixSource = undefined
    lipSource = undefined
    stopping = false
  }

  function stop() {
    cancelAnimationFrame(frame)
    frame = 0
    stopSources()
    isPlaying.value = false
    currentTime.value = 0
    songId.value = undefined
  }

  function startSource(buffer: AudioBuffer, destination: AudioNode, at: number) {
    const node = audioContext.createBufferSource()
    node.buffer = buffer
    node.connect(destination)
    node.start(at)
    return node
  }

  async function decode(url: string): Promise<AudioBuffer> {
    const response = await fetch(url)
    return audioContext.decodeAudioData(await response.arrayBuffer())
  }

  async function play(id: string) {
    stop()
    const mixUrl = await karaoke.getAudioUrl(id, 'audio')
    if (!mixUrl)
      throw new Error('The song has no playable audio.')
    const vocalUrl = await karaoke.getAudioUrl(id, 'vocal')
    const manifest = await karaoke.getManifest(id)
    const vocalOffset = Math.max(0, Number(manifest?.vocalOffsetMs ?? 0)) / 1000

    await audioContext.resume()
    const mix = await decode(mixUrl)
    const voice = vocalUrl ? await decode(vocalUrl) : mix

    const at = audioContext.currentTime + 0.05
    mixSource = startSource(mix, ensureMixGain(), at)
    // The vocal stem may start later than the mix; the manifest records where.
    lipSource = startSource(voice, ensureLipGain(), vocalUrl ? at + vocalOffset : at)
    mixSource.onended = () => {
      if (!stopping)
        stop()
    }

    startedAt = at
    duration.value = mix.duration
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
    gain: mixGain,
    connectOutput,
    play,
    stop,
  }
})
