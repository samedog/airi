import type { KaraokePlaybackCommand, KaraokePlaybackState } from '@proj-airi/stage-shared/karaoke'

import { errorMessageFrom } from '@moeru/std'
import { KARAOKE_PLAYBACK_COMMAND_CHANNEL, KARAOKE_PLAYBACK_STATE_CHANNEL, pickKaraokeSong } from '@proj-airi/stage-shared/karaoke'
import { useBroadcastChannel, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import { setKaraokeSinging } from '../libs/speech/singing-gate'
import { waitForSpeechSettled } from '../libs/speech/wait-for-speech-settled'
import { useAudioContext, useSpeakingStore } from './audio'
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

  /**
   * True in the window that renders the avatar.
   *
   * The settings window and the stage window are separate renderers with their
   * own audio graph, so only the stage window plays. The settings window sends a
   * command over the broadcast channel and shows the state that comes back.
   */
  const stageHost = ref(false)
  /**
   * Reports a reply that is still streaming or playing in this window.
   *
   * The stage supplies it, because only the stage knows its speech turns; a
   * window without one falls back to audible speech.
   */
  let speechBusy: (() => boolean) | undefined
  /** The song waiting for the character to stop talking, if any. */
  const pendingSongId = ref<string>()
  let pendingAttempt = 0
  const commandBus = useBroadcastChannel<KaraokePlaybackCommand, KaraokePlaybackCommand>({ name: KARAOKE_PLAYBACK_COMMAND_CHANNEL })
  const stateBus = useBroadcastChannel<KaraokePlaybackState, KaraokePlaybackState>({ name: KARAOKE_PLAYBACK_STATE_CHANNEL })
  let lastPublishedTick = -1

  function publishState() {
    if (!stageHost.value)
      return
    stateBus.post({
      isPlaying: isPlaying.value,
      songId: songId.value,
      currentTime: currentTime.value,
      duration: duration.value,
    })
  }

  /** The playback this window shows: its own in the stage, the reported one in settings. */
  const activeState = computed<KaraokePlaybackState>(() => {
    if (stageHost.value) {
      return {
        isPlaying: isPlaying.value,
        songId: songId.value,
        currentTime: currentTime.value,
        duration: duration.value,
      }
    }
    return stateBus.data.value ?? { isPlaying: false, currentTime: 0, duration: 0 }
  })

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
    // The settings window shows this progress, so publish it a few times a second.
    const tickIndex = Math.floor(currentTime.value * 4)
    if (tickIndex !== lastPublishedTick) {
      lastPublishedTick = tickIndex
      publishState()
    }
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
    cancelQueuedSong()
    cancelAnimationFrame(frame)
    frame = 0
    stopSources()
    isPlaying.value = false
    setKaraokeSinging(false)
    currentTime.value = 0
    songId.value = undefined
    lastPublishedTick = -1
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
    // Every reply and Spark notification stays quiet until the song ends.
    setKaraokeSinging(true)
    publishState()
    tick()
  }

  watch(commandBus.data, (command) => {
    if (!stageHost.value || !command)
      return
    if (command.type === 'play') {
      void play(command.songId).catch((cause) => {
        stateBus.post({
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          error: errorMessageFrom(cause) ?? 'The song could not be played.',
        })
      })
      return
    }
    if (command.type === 'sing') {
      // The window that asked may not have the library loaded, so the stage
      // window picks from its own list and plays it.
      void (async () => {
        if (karaoke.songs.length === 0)
          await karaoke.refresh()
        if (karaoke.songs.length === 0)
          karaoke.restoreCachedSongs()
        const song = command.songId
          ? (karaoke.songs.find(entry => entry.id === command.songId) ?? { id: command.songId })
          : pickKaraokeSong(karaoke.songs, command.query)
        console.info('[karaoke] sing request', { query: command.query, songId: command.songId, songs: karaoke.songs.length, picked: song?.id })
        if (!song) {
          // Say why, instead of the useless "no songs installed": the listing can
          // fail in this window while another window shows the library.
          const reason = !karaoke.supported
            ? 'this window is not an Electron renderer'
            : (karaoke.error ?? 'the library returned no songs')
          stateBus.post({
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            error: `The stage window cannot see the song library (${reason}).`,
          })
          return
        }
        queueSong(song.id)
      })().catch((cause) => {
        stateBus.post({
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          error: errorMessageFrom(cause) ?? 'The song could not be played.',
        })
      })
      return
    }
    stop()
  })

  watch([isPlaying, songId, duration], publishState)

  /**
   * The avatar window calls this when it mounts. Only that window plays audio.
   *
   * `isSpeechBusy` reports that window's open speech turns, so a queued song
   * waits for the whole reply, not only for audible speech.
   */
  function attachStage(options: { isSpeechBusy?: () => boolean } = {}) {
    speechBusy = options.isSpeechBusy
    stageHost.value = true
    publishState()
  }

  function detachStage() {
    stop()
    speechBusy = undefined
    stageHost.value = false
    stateBus.post({ isPlaying: false, currentTime: 0, duration: 0 })
  }

  /**
   * True while a reply is still streaming or playing in this window.
   *
   * The response turn stays active from the moment the reply is composed until
   * its playback drains, so this covers an answer that has not reached the
   * speech engine yet. Without the stage's report only audible speech counts.
   */
  function speechIsBusy() {
    if (speechBusy?.())
      return true
    return useSpeakingStore().nowSpeaking
  }

  /**
   * Resolves once the character has finished talking.
   *
   * A karaoke request arrives in the middle of the reply that announces it, and
   * that reply has not even reached the speech engine yet, so neither
   * `nowSpeaking` nor a fixed grace period is enough. The settle wait follows
   * the speech turn instead: it ends after the turn drained and a short quiet
   * moment confirms no second response is starting.
   */
  async function waitForSpeechIdle(): Promise<void> {
    await waitForSpeechSettled(speechIsBusy)
  }

  /** Drops a queued song, so a newer request or a stop cannot be overtaken by it. */
  function cancelQueuedSong() {
    pendingAttempt += 1
    pendingSongId.value = undefined
  }

  async function startQueuedSong(attempt: number, id: string) {
    await waitForSpeechIdle()
    if (attempt !== pendingAttempt || pendingSongId.value !== id)
      return
    pendingSongId.value = undefined
    await play(id)
  }

  /**
   * Queues a song behind the reply that is announcing it.
   *
   * The tool runs before the reply text exists, so starting the song here would
   * either cut the announcement off or speak it over the intro. The song waits
   * for the turn to drain and then plays, the way a person waits for their turn.
   */
  function queueSong(id: string) {
    const attempt = ++pendingAttempt
    pendingSongId.value = id
    void startQueuedSong(attempt, id).catch((cause) => {
      if (attempt !== pendingAttempt)
        return
      pendingSongId.value = undefined
      stateBus.post({
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        error: errorMessageFrom(cause) ?? 'The song could not be played.',
      })
    })
  }

  async function requestPlay(id: string) {
    if (!stageHost.value) {
      commandBus.post({ type: 'play', songId: id })
      return
    }
    await play(id)
  }

  /**
   * Asks for a song to be performed. Without a stage host, the request travels
   * to the stage window, which owns both the library and the audio graph.
   */
  async function requestSing(query?: string, songId?: string) {
    if (!stageHost.value) {
      commandBus.post({ type: 'sing', query, songId })
      return
    }
    if (karaoke.songs.length === 0)
      await karaoke.refresh()
    if (karaoke.songs.length === 0)
      karaoke.restoreCachedSongs()
    const song = songId ? { id: songId } : pickKaraokeSong(karaoke.songs, query)
    if (!song)
      return
    queueSong(song.id)
  }

  function requestStop() {
    if (!stageHost.value) {
      commandBus.post({ type: 'stop' })
      return
    }
    stop()
  }

  return {
    isPlaying,
    currentTime,
    duration,
    songId,
    /** The song waiting for the character to stop talking, if any. */
    pendingSongId,
    volume,
    gain: mixGain,
    activeState,
    connectOutput,
    play,
    stop,
    requestPlay,
    requestSing,
    requestStop,
    attachStage,
    detachStage,
  }
})
