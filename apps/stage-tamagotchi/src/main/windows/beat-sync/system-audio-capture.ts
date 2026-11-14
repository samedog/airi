import type { Buffer } from 'node:buffer'

import type { BeatSyncAudioCaptureStartRequest, BeatSyncAudioSource } from '@proj-airi/stage-shared/beat-sync/audio-capture'
import type { BrowserWindow } from 'electron'

import { execFile, spawn } from 'node:child_process'

import { useLogg } from '@guiiai/logg'
import {
  beatSyncAudioCaptureChannels,
  beatSyncAudioCaptureChunkChannel,
  beatSyncAudioCaptureListSourcesChannel,
  beatSyncAudioCaptureSampleRate,
  beatSyncAudioCaptureStartChannel,
  beatSyncAudioCaptureStopChannel,
} from '@proj-airi/stage-shared/beat-sync/audio-capture'
import { ipcMain } from 'electron'

const log = useLogg('beat-sync-audio').useGlobalConfig()

interface PactlSource {
  index: number
  name: string
  description?: string
  state?: string
  monitor_source?: string
}

function runPactl(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('pactl', args, { encoding: 'utf8', timeout: 3000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve(stdout)
    })
  })
}

/**
 * Lists PipeWire/PulseAudio sources, including monitor sources and microphones.
 *
 * The user has to choose one explicitly. There is deliberately no default source and no fallback,
 * because silently choosing the microphone conflicts with voice chat applications.
 */
async function listAudioSources(): Promise<BeatSyncAudioSource[]> {
  const raw = await runPactl(['-f', 'json', 'list', 'sources'])
  const sources = JSON.parse(raw) as PactlSource[]

  return sources
    .filter(source => !!source.name)
    .map((source) => {
      const isMonitor = !!source.monitor_source
        || source.name.endsWith('.monitor')
        || source.description?.startsWith('Monitor of')
      return {
        id: source.name,
        label: source.description?.trim() || source.name,
        kind: isMonitor ? 'monitor' as const : 'input' as const,
        description: isMonitor ? 'System output' : 'Microphone',
      }
    })
    .sort((a, b) => {
      if (a.kind === b.kind)
        return a.label.localeCompare(b.label)
      return a.kind === 'monitor' ? -1 : 1
    })
}

interface ActiveCapture {
  child: ReturnType<typeof spawn>
  webContentsId: number
}

let activeCapture: ActiveCapture | undefined

function stopCapture(): void {
  if (!activeCapture)
    return

  const { child } = activeCapture
  activeCapture = undefined
  child.stdout?.removeAllListeners()
  child.stderr?.removeAllListeners()
  child.removeAllListeners()
  child.kill('SIGTERM')
}

/**
 * Starts `parec` for the explicitly selected source and forwards raw s16le PCM to the Beat Sync renderer.
 *
 * Electron's own Linux loopback capture is unreliable on PipeWire. `parec` records the selected
 * monitor or microphone directly, and the caller must choose that source in the UI.
 */
async function startCapture(
  window: BrowserWindow,
  sourceId: string,
): Promise<{ sampleRate: number, channels: number, source: BeatSyncAudioSource }> {
  stopCapture()

  const sources = await listAudioSources()
  const source = sources.find(candidate => candidate.id === sourceId)
  if (!source)
    throw new Error('The selected Beat Sync audio source is no longer available')

  const child = spawn('parec', [
    `--device=${source.id}`,
    '--format=s16le',
    `--rate=${beatSyncAudioCaptureSampleRate}`,
    `--channels=${beatSyncAudioCaptureChannels}`,
    '--latency-msec=10',
    '--raw',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  return new Promise((resolve, reject) => {
    let settled = false
    let receivedFirstChunk = false
    let timeout: NodeJS.Timeout | undefined

    const fail = (error: Error) => {
      if (settled)
        return
      settled = true
      if (timeout)
        clearTimeout(timeout)
      if (activeCapture?.child === child)
        activeCapture = undefined
      child.kill('SIGTERM')
      reject(error)
    }

    timeout = setTimeout(() => {
      fail(new Error(`Timed out waiting for audio from ${source.id}`))
    }, 5000)

    child.once('error', (error) => {
      fail(error)
    })

    child.once('exit', (code, signal) => {
      if (!receivedFirstChunk) {
        fail(new Error(`parec exited before producing audio (code=${code ?? 'null'}, signal=${signal ?? 'null'})`))
      }
      else if (activeCapture?.child === child) {
        activeCapture = undefined
      }
    })

    child.stderr?.on('data', (data) => {
      const message = data.toString().trim()
      if (message)
        log.warn(`parec stderr: ${message}`)
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      if (window.isDestroyed())
        return

      if (!receivedFirstChunk) {
        receivedFirstChunk = true
        settled = true
        if (timeout)
          clearTimeout(timeout)
        activeCapture = { child, webContentsId: window.webContents.id }
        resolve({
          sampleRate: beatSyncAudioCaptureSampleRate,
          channels: beatSyncAudioCaptureChannels,
          source,
        })
      }

      window.webContents.send(beatSyncAudioCaptureChunkChannel, chunk)
    })
  })
}

/** Installs the Linux audio-capture IPC handlers for the hidden Beat Sync window. */
export function setupBeatSyncAudioCapture(window: BrowserWindow): void {
  ipcMain.removeHandler(beatSyncAudioCaptureListSourcesChannel)
  ipcMain.removeHandler(beatSyncAudioCaptureStartChannel)
  ipcMain.removeHandler(beatSyncAudioCaptureStopChannel)

  ipcMain.handle(beatSyncAudioCaptureListSourcesChannel, async () => {
    return listAudioSources()
  })

  ipcMain.handle(beatSyncAudioCaptureStartChannel, async (event, request: BeatSyncAudioCaptureStartRequest) => {
    if (event.sender.id !== window.webContents.id)
      throw new Error('Beat Sync audio capture is not available to this window')
    if (!request?.sourceId)
      throw new Error('Select a Beat Sync audio source before starting')
    return startCapture(window, request.sourceId)
  })

  ipcMain.handle(beatSyncAudioCaptureStopChannel, async (event) => {
    if (event.sender.id !== window.webContents.id)
      throw new Error('Beat Sync audio capture is not available to this window')
    stopCapture()
  })

  window.once('closed', () => {
    stopCapture()
    ipcMain.removeHandler(beatSyncAudioCaptureListSourcesChannel)
    ipcMain.removeHandler(beatSyncAudioCaptureStartChannel)
    ipcMain.removeHandler(beatSyncAudioCaptureStopChannel)
  })
}
