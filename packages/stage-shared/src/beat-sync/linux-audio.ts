import type { ElectronWindow } from '../window'
import type { BeatSyncAudioCaptureStartRequest } from './audio-capture'

import {
  beatSyncAudioCaptureChannels,
  beatSyncAudioCaptureChunkChannel,
  beatSyncAudioCaptureSampleRate,
  beatSyncAudioCaptureStartChannel,
  beatSyncAudioCaptureStopChannel,
} from './audio-capture'

interface AudioDataLike {
  close: () => void
}

type AudioDataConstructor = new (init: {
  format: 's16'
  sampleRate: number
  numberOfFrames: number
  numberOfChannels: number
  timestamp: number
  data: ArrayBuffer
}) => AudioDataLike

interface MediaStreamTrackGeneratorLike extends MediaStreamTrack {
  writable: WritableStream<AudioDataLike>
}

type MediaStreamTrackGeneratorConstructor = new (init: { kind: 'audio' }) => MediaStreamTrackGeneratorLike

export interface LinuxSystemAudioNode {
  node: AudioNode
  stop: () => void
}

/**
 * Creates an audio node from the PipeWire monitor source captured by the main process.
 *
 * Chromium does not expose monitor sources through `enumerateDevices`, and Electron's Linux desktop
 * capture does not reliably attach the loopback audio track. The main process records the monitor with
 * `parec` and sends raw s16le PCM over IPC instead.
 */
export async function createLinuxSystemAudioNode(
  context: AudioContext,
  electronWindow: Window & ElectronWindow,
  sourceId: string,
): Promise<LinuxSystemAudioNode> {
  const AudioDataCtor = (globalThis as typeof globalThis & { AudioData?: AudioDataConstructor }).AudioData
  const MediaStreamTrackGeneratorCtor = (globalThis as typeof globalThis & {
    MediaStreamTrackGenerator?: MediaStreamTrackGeneratorConstructor
  }).MediaStreamTrackGenerator

  if (!AudioDataCtor || !MediaStreamTrackGeneratorCtor)
    throw new Error('MediaStreamTrackGenerator and AudioData are not available in this renderer')

  const generator = new MediaStreamTrackGeneratorCtor({ kind: 'audio' })
  const writer = generator.writable.getWriter()
  const stream = new MediaStream([generator])
  const source = context.createMediaStreamSource(stream)

  // The monitor signal is often very quiet, especially when the monitor source volume is low.
  // Apply adaptive gain only to monitor sources; microphone capture keeps its original level.
  const isMonitorSource = sourceId.endsWith('.monitor')
  const gain = context.createGain()
  gain.gain.value = isMonitorSource ? 8 : 1
  source.connect(gain)

  let timestamp = 0
  let stopped = false
  let writeChain = Promise.resolve()

  const updateGain = (bytes: Uint8Array, usableBytes: number) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, usableBytes)
    let peak = 0

    for (let offset = 0; offset < usableBytes; offset += 2) {
      const sample = Math.abs(view.getInt16(offset, true))
      if (sample > peak)
        peak = sample
    }

    const normalizedPeak = peak / 32768
    if (normalizedPeak < 0.0001)
      return

    const targetGain = Math.min(64, Math.max(1, 0.5 / normalizedPeak))
    gain.gain.setTargetAtTime(targetGain, context.currentTime, 0.15)
  }

  const onChunk = (_event: unknown, chunk: Uint8Array) => {
    if (stopped)
      return

    const bytes = new Uint8Array(chunk)
    const frameBytes = beatSyncAudioCaptureChannels * 2
    const usableBytes = bytes.byteLength - (bytes.byteLength % frameBytes)
    if (!usableBytes)
      return

    if (isMonitorSource)
      updateGain(bytes, usableBytes)

    const numberOfFrames = usableBytes / frameBytes
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + usableBytes)
    const audioData = new AudioDataCtor({
      format: 's16',
      sampleRate: beatSyncAudioCaptureSampleRate,
      numberOfFrames,
      numberOfChannels: beatSyncAudioCaptureChannels,
      timestamp,
      data,
    })

    timestamp += Math.round(numberOfFrames * 1_000_000 / beatSyncAudioCaptureSampleRate)

    writeChain = writeChain
      .then(() => writer.write(audioData))
      .catch(() => {})
      .finally(() => audioData.close())
  }

  const stop = () => {
    if (stopped)
      return
    stopped = true
    electronWindow.electron.ipcRenderer.removeListener(beatSyncAudioCaptureChunkChannel, onChunk)
    void electronWindow.electron.ipcRenderer.invoke(beatSyncAudioCaptureStopChannel).catch(() => {})
    void writer.close().catch(() => {})
    stream.getTracks().forEach(track => track.stop())
  }

  try {
    electronWindow.electron.ipcRenderer.on(beatSyncAudioCaptureChunkChannel, onChunk)
    await electronWindow.electron.ipcRenderer.invoke(beatSyncAudioCaptureStartChannel, {
      sourceId,
    } satisfies BeatSyncAudioCaptureStartRequest)
  }
  catch (error) {
    stop()
    throw error
  }

  return {
    node: gain,
    stop,
  }
}
