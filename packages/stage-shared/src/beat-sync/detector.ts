import type { SerializableDesktopCapturerSource } from '@proj-airi/electron-screen-capture'

import type { BeatSyncBeat, BeatSyncDetectorEventMap, BeatSyncDetectorState, BeatSyncVibe } from './types'

import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { setupElectronScreenCapture } from '@proj-airi/electron-screen-capture/renderer'

import { isStageCapacitor, isStageTamagotchi, isStageWeb, StageEnvironment } from '../environment'
import { isElectronWindow } from '../window'
import {
  beatSyncBeatSignaledInvokeEventa,
  beatSyncGetStateInvokeEventa,
  beatSyncStateChangedInvokeEventa,
  beatSyncToggleInvokeEventa,
  beatSyncUpdateVibeParametersInvokeEventa,
  beatSyncVibeSignaledInvokeEventa,
  createContext,
} from './eventa'
import { createLinuxSystemAudioNode } from './linux-audio'
import { BEAT_SYNC_HIT_COOLDOWN_MS, BEAT_SYNC_HIT_THRESHOLD } from './settings'
import { BeatSyncVibeTracker } from './vibe'

const vibeAnalyserFFTSize = 2048
const vibeIntervalMs = 33
const invokeTimeoutMs = 2000
// Linux capture waits up to five seconds for the first `parec` chunk. Keep the
// toggle round trip longer than that so a silent source is not reported as a
// failed start while capture is still becoming active.
const toggleInvokeTimeoutMs = 10_000

/** Rejects a pending eventa round trip without cancelling its underlying work. */
export function withInvokeTimeout<T>(promise: Promise<T>, label: string, timeoutMs = invokeTimeoutMs): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  return new Promise<T>((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)
    promise.then(resolve, reject).finally(() => {
      if (timeout)
        clearTimeout(timeout)
    })
  })
}

/** A source node with an optional cleanup callback for its capture stream. */
export interface BeatSyncSourceHandle {
  node: AudioNode
  stop?: () => void
}

export interface BeatSyncDetector {
  /** `isCurrent` becomes false when this attempt is stopped or superseded. */
  start: (createSource: (context: AudioContext, isCurrent: () => boolean) => Promise<BeatSyncSourceHandle>) => Promise<void>
  updateVibeParameters: (params: { energyGain?: number }) => void
  startScreenCapture: (sourceId?: string) => Promise<void>
  stop: () => void
  on: <E extends keyof BeatSyncDetectorEventMap>(event: E, listener: BeatSyncDetectorEventMap[E]) => () => void
  off: <E extends keyof BeatSyncDetectorEventMap>(event: E, listener: BeatSyncDetectorEventMap[E]) => void
  readonly state: BeatSyncDetectorState
  readonly context: AudioContext | undefined
  readonly source: AudioNode | undefined
}

export type CreateBeatSyncDetectorOptions
  = | { env: StageEnvironment.Tamagotchi }
    | { env: StageEnvironment.Web }
    | { env: StageEnvironment.Capacitor }

export function createBeatSyncDetector(options: CreateBeatSyncDetectorOptions): BeatSyncDetector {
  let context: AudioContext | undefined
  let source: AudioNode | undefined
  const state = {
    isActive: false,
  }

  let stopSource: (() => void) | undefined

  let vibeAnalyserNode: AnalyserNode | undefined
  let vibeSinkNode: GainNode | undefined
  let vibeTimeDomainBuffer: Uint8Array<ArrayBuffer> | undefined
  let vibeFrequencyBuffer: Uint8Array<ArrayBuffer> | undefined
  let vibeInterval: ReturnType<typeof setInterval> | undefined
  let startGeneration = 0
  const vibeTracker = new BeatSyncVibeTracker()

  const listeners: { [K in keyof BeatSyncDetectorEventMap]: Array<(...args: any) => void> } = {
    stateChange: [],
    beat: [],
    vibe: [],
  }

  const emit = <E extends keyof BeatSyncDetectorEventMap>(event: E, ...args: Parameters<BeatSyncDetectorEventMap[E]>) => {
    for (const listener of [...listeners[event]]) {
      try {
        listener(...args)
      }
      catch (error) {
        console.warn(`[beat-sync] Listener for "${event}" failed`, error)
      }
    }
  }

  const stopVibeLoop = () => {
    if (vibeInterval)
      clearInterval(vibeInterval)
    vibeInterval = undefined
  }

  const disposeResources = () => {
    stopVibeLoop()
    vibeTracker.reset()
    stopSource?.()
    stopSource = undefined

    vibeAnalyserNode?.disconnect()
    vibeAnalyserNode = undefined
    vibeSinkNode?.disconnect()
    vibeSinkNode = undefined
    vibeTimeDomainBuffer = undefined
    vibeFrequencyBuffer = undefined

    source?.disconnect()
    source = undefined

    const currentContext = context
    context = undefined
    if (currentContext && currentContext.state !== 'closed')
      void currentContext.close().catch(() => {})
  }

  const startVibeLoop = () => {
    stopVibeLoop()
    let lastBeatAt = Number.NEGATIVE_INFINITY
    vibeInterval = setInterval(() => {
      try {
        if (!vibeAnalyserNode || !vibeTimeDomainBuffer || !vibeFrequencyBuffer)
          return

        vibeAnalyserNode.getByteTimeDomainData(vibeTimeDomainBuffer)
        vibeAnalyserNode.getByteFrequencyData(vibeFrequencyBuffer)
        const now = performance.now()
        const vibe = vibeTracker.update(vibeTimeDomainBuffer, vibeFrequencyBuffer, now)
        emit('vibe', vibe)
        if (vibe.hit >= BEAT_SYNC_HIT_THRESHOLD && now - lastBeatAt >= BEAT_SYNC_HIT_COOLDOWN_MS) {
          lastBeatAt = now
          emit('beat', {} satisfies BeatSyncBeat)
        }
      }
      catch (error) {
        console.warn('[beat-sync] Vibe analysis failed', error)
      }
    }, vibeIntervalMs)
  }

  const stop = () => {
    // Invalidate any in-flight start before tearing down the active graph.
    startGeneration++
    const wasActive = state.isActive
    state.isActive = false
    if (wasActive)
      emit('stateChange', state)
    disposeResources()
  }

  const start = async (createSource: (context: AudioContext, isCurrent: () => boolean) => Promise<BeatSyncSourceHandle>) => {
    stop()

    const generation = startGeneration
    const nextContext = new AudioContext()
    context = nextContext
    const isCurrent = () => generation === startGeneration
      && context === nextContext
      && nextContext.state !== 'closed'

    let nextSource: BeatSyncSourceHandle | undefined
    let nextAnalyser: AnalyserNode | undefined
    let nextSink: GainNode | undefined

    const disposeAttempt = () => {
      nextSource?.stop?.()
      nextSource?.node.disconnect()
      nextAnalyser?.disconnect()
      nextSink?.disconnect()
      if (nextContext.state !== 'closed')
        void nextContext.close().catch(() => {})
    }

    try {
      if (nextContext.state === 'suspended')
        await nextContext.resume()

      nextContext.addEventListener('statechange', () => {
        if (nextContext.state === 'closed' && context === nextContext)
          stop()
      })

      nextSource = await createSource(nextContext, isCurrent)
      if (!isCurrent()) {
        disposeAttempt()
        return
      }

      nextAnalyser = nextContext.createAnalyser()
      nextAnalyser.fftSize = vibeAnalyserFFTSize
      nextAnalyser.smoothingTimeConstant = 0.2

      // A zero-gain sink keeps the analyser graph running without playing audio.
      nextSink = nextContext.createGain()
      nextSink.gain.value = 0
      nextSource.node.connect(nextAnalyser)
      nextAnalyser.connect(nextSink)
      nextSink.connect(nextContext.destination)

      if (!isCurrent()) {
        disposeAttempt()
        return
      }

      vibeAnalyserNode = nextAnalyser
      vibeSinkNode = nextSink
      vibeTimeDomainBuffer = new Uint8Array(nextAnalyser.fftSize)
      vibeFrequencyBuffer = new Uint8Array(nextAnalyser.frequencyBinCount)
      source = nextSource.node
      stopSource = nextSource.stop

      vibeTracker.reset()
      startVibeLoop()
      state.isActive = true
      emit('stateChange', state)
    }
    catch (error) {
      disposeAttempt()
      if (generation === startGeneration)
        disposeResources()
      throw error
    }
  }

  const updateVibeParameters = (params: { energyGain?: number }) => {
    if (params.energyGain !== undefined)
      vibeTracker.setEnergyGain(params.energyGain)
  }

  const startScreenCapture = async (sourceId?: string) => {
    if (!sourceId)
      throw new Error('Select a Beat Sync audio source before starting')

    return start(async (ctx, isCurrent) => {
      switch (options.env) {
        case StageEnvironment.Web: {
          if (sourceId !== 'system')
            throw new Error('This audio source is not available in the current environment')

          const stream = await navigator.mediaDevices.getDisplayMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
            video: true,
          })

          if (stream.getAudioTracks().length === 0) {
            stream.getTracks().forEach(track => track.stop())
            throw new Error('No audio track available in the stream')
          }

          // Video is only requested because Chromium requires it to expose the
          // display-audio track. Do not keep the screen capture active.
          stream.getVideoTracks().forEach(track => track.stop())

          stream.getAudioTracks().forEach((track) => {
            let stopCalled = false
            track.addEventListener('ended', () => {
              // A track from a superseded start must not tear down the current graph.
              if (stopCalled || !isCurrent())
                return
              stopCalled = true
              stop()
            })
          })

          try {
            const node = ctx.createMediaStreamSource(stream)
            return {
              node,
              stop: () => stream.getTracks().forEach(track => track.stop()),
            }
          }
          catch (error) {
            stream.getTracks().forEach(track => track.stop())
            throw error
          }
        }
        case StageEnvironment.Tamagotchi: {
          if (!isElectronWindow(window)) {
            throw new Error(`Electron window is required for this environment: ${options.env}`)
          }

          if (window.platform === 'linux') {
            try {
              const { node, stop } = await createLinuxSystemAudioNode(ctx, window, sourceId)
              return { node, stop }
            }
            catch (error) {
              const message = errorMessageFrom(error) ?? 'unknown error'
              console.warn('[beat-sync] Linux audio capture failed', error)
              // Deliberately do not fall back to Electron display capture on Linux: it may capture the
              // microphone or every system source instead of the source selected by the user.
              throw new Error(`Linux audio capture failed: ${message}`)
            }
          }

          if (sourceId !== 'system')
            throw new Error('This audio source is not available in the current environment')

          // FIXME(Makito): Will refactor later
          const { createContext } = await import('@moeru/eventa/adapters/electron/renderer')
          const { selectWithSource } = setupElectronScreenCapture(createContext(window.electron.ipcRenderer).context)

          const stream = await selectWithSource(
            (sources: SerializableDesktopCapturerSource[]) => {
              if (sources.length === 0)
                throw new Error('No screen source available')
              return sources[0].id
            },
            async () => await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true,
            }),
            { sourcesOptions: { types: ['screen'] } },
          )

          try {
            const videoTracks = stream.getVideoTracks()

            videoTracks.forEach((track: MediaStreamTrack) => {
              track.stop()
              stream.removeTrack(track)
            })

            const node = ctx.createMediaStreamSource(stream)
            return {
              node,
              stop: () => stream.getTracks().forEach((track: MediaStreamTrack) => track.stop()),
            }
          }
          catch (error) {
            stream.getTracks().forEach((track: MediaStreamTrack) => track.stop())
            throw error
          }
        }
        default:
          throw new Error('Failed to start screen capture: Unsupported environment')
      }
    })
  }

  const off = <E extends keyof BeatSyncDetectorEventMap>(event: E, listener: BeatSyncDetectorEventMap[E]) => {
    const listenerFns = listeners[event]
    if (!listenerFns) {
      throw new Error(`Unknown event: ${event}`)
    }

    const index = listenerFns.indexOf(listener)
    if (index !== -1)
      listenerFns.splice(index, 1)
  }

  const on = <E extends keyof BeatSyncDetectorEventMap>(event: E, listener: BeatSyncDetectorEventMap[E]) => {
    const listenerFns = listeners[event]
    if (!listenerFns) {
      throw new Error(`Unknown event: ${event}`)
    }
    listenerFns.push(listener)
    return () => off(event, listener)
  }

  return {
    start,
    updateVibeParameters,
    startScreenCapture,
    stop,
    on,
    off,

    get state() { return state },
    get context() { return context },
    get source() { return source },
  }
}

let detector: BeatSyncDetector | undefined
function getDetector() {
  if (!isStageWeb())
    throw new Error('getDetector() is only available in Stage Web environment')

  if (!detector)
    detector = createBeatSyncDetector({ env: StageEnvironment.Web })

  return detector
}

let context: ReturnType<typeof createContext> | undefined

function installCapacitorHandlers(context: ReturnType<typeof createContext>) {
  defineInvokeHandler(context, beatSyncToggleInvokeEventa, async (request) => {
    if (request.enabled)
      throw new Error('Beat Sync is not available in Stage Pocket')
  })
  defineInvokeHandler(context, beatSyncGetStateInvokeEventa, async () => ({ isActive: false }))
  defineInvokeHandler(context, beatSyncUpdateVibeParametersInvokeEventa, async () => {})
}

function getContext() {
  if (!context) {
    context = createContext()

    // Capacitor cannot capture system audio. Register every request handler so
    // callers receive deterministic inactive results instead of pending forever.
    if (isStageCapacitor())
      installCapacitorHandlers(context)
  }

  return context
}

/** Returns whether the current Stage runtime can capture audio for Beat Sync. */
export function isBeatSyncSupported() {
  return isStageWeb() || isStageTamagotchi()
}

export function toggleBeatSync(enabled: boolean, sourceId?: string) {
  if (isStageWeb()) {
    if (enabled) {
      return getDetector().startScreenCapture(sourceId)
    }
    else {
      return getDetector().stop()
    }
  }

  if (isStageTamagotchi() || isStageCapacitor()) {
    const toggleFn = defineInvoke(getContext(), beatSyncToggleInvokeEventa)
    return withInvokeTimeout(toggleFn({ enabled, sourceId }), 'Beat Sync toggle', toggleInvokeTimeoutMs)
  }

  throw new Error('Unknown environment for beatSyncToggle()')
}

export async function getBeatSyncState() {
  if (isStageWeb()) {
    return getDetector().state
  }

  if (isStageTamagotchi() || isStageCapacitor()) {
    return withInvokeTimeout(
      defineInvoke(getContext(), beatSyncGetStateInvokeEventa)(),
      'Beat Sync state',
    )
  }

  throw new Error('Unknown environment for getBeatSyncState()')
}

export function updateBeatSyncVibeParameters(params: { energyGain?: number }) {
  if (isStageWeb()) {
    return getDetector().updateVibeParameters(params)
  }

  if (isStageTamagotchi() || isStageCapacitor()) {
    return withInvokeTimeout(
      defineInvoke(getContext(), beatSyncUpdateVibeParametersInvokeEventa)(params),
      'Beat Sync parameter update',
    )
  }

  throw new Error('Unknown environment for updateBeatSyncVibeParameters()')
}

export function listenBeatSyncStateChange(listener: (state: BeatSyncDetectorState) => void) {
  if (isStageWeb()) {
    return getDetector().on('stateChange', listener)
  }

  if (isStageTamagotchi() || isStageCapacitor()) {
    return defineInvokeHandler(getContext(), beatSyncStateChangedInvokeEventa, listener)
  }

  throw new Error('Unknown environment for listenBeatSyncStateChange()')
}

export function listenBeatSyncBeatSignal(listener: (e: BeatSyncBeat) => void) {
  if (isStageWeb()) {
    return getDetector().on('beat', listener)
  }

  if (isStageTamagotchi() || isStageCapacitor()) {
    return defineInvokeHandler(getContext(), beatSyncBeatSignaledInvokeEventa, listener)
  }

  throw new Error('Unknown environment for listenBeatSyncBeatSignal()')
}

export function listenBeatSyncVibeSignal(listener: (vibe: BeatSyncVibe) => void) {
  if (isStageWeb()) {
    return getDetector().on('vibe', listener)
  }

  if (isStageTamagotchi() || isStageCapacitor()) {
    return defineInvokeHandler(getContext(), beatSyncVibeSignaledInvokeEventa, listener)
  }

  throw new Error('Unknown environment for listenBeatSyncVibeSignal()')
}
