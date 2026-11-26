import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { KaraokeManifest, KaraokeSongAsset, KaraokeSongFile } from '@proj-airi/stage-shared/karaoke'

import { Buffer } from 'node:buffer'
import { mkdir, open, readdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import {
  electronKaraokeSongRead,
  electronKaraokeSongRemove,
  electronKaraokeSongReveal,
  electronKaraokeSongsList,
  isKaraokeManifest,
  isSafeKaraokeSongId,
  KARAOKE_MANIFEST_FILE,
  karaokeFileFor,
  wavDurationSec,
} from '@proj-airi/stage-shared/karaoke'
import { app, shell } from 'electron'

const HEADER_PROBE_BYTES = 64 * 1024

async function readManifest(directory: string): Promise<KaraokeManifest | undefined> {
  try {
    const parsed = JSON.parse(await readFile(join(directory, KARAOKE_MANIFEST_FILE), 'utf8')) as unknown
    return isKaraokeManifest(parsed) ? parsed : undefined
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT' || error instanceof SyntaxError)
      return undefined
    throw error
  }
}

/** Reads only the head of the file, so a large mix does not have to be loaded. */
async function probeWavDuration(path: string): Promise<number | undefined> {
  try {
    const handle = await open(path, 'r')
    try {
      const buffer = Buffer.alloc(HEADER_PROBE_BYTES)
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0)
      const head = buffer.subarray(0, bytesRead)
      return wavDurationSec(head.buffer.slice(head.byteOffset, head.byteOffset + head.byteLength))
    }
    finally {
      await handle.close()
    }
  }
  catch {
    return undefined
  }
}

async function songSize(directory: string, manifest: KaraokeManifest): Promise<number | undefined> {
  const files = [manifest.audio, manifest.vocal, manifest.instrumental]
    .filter((file): file is string => Boolean(file))
  let size = 0
  for (const file of files) {
    try {
      const info = await stat(join(directory, file))
      if (!info.isFile() || info.size === 0)
        return undefined
      size += info.size
    }
    catch {
      return undefined
    }
  }
  return size
}

/**
 * Owns the user-local karaoke library under `userData/karaoke`.
 *
 * The local pipeline writes song packages into `songs/<id>/`; this service only
 * reads them. Folders copied in by hand behave like imported packages, the same
 * way the VRM animation library picks up files dropped into its folder.
 */
export function setupKaraoke(context: ReturnType<typeof createContext>['context']): void {
  const root = join(app.getPath('userData'), 'karaoke')
  const songsRoot = join(root, 'songs')

  async function listSongs(): Promise<KaraokeSongAsset[]> {
    await mkdir(songsRoot, { recursive: true })
    const entries = await readdir(songsRoot, { withFileTypes: true })
    const assets: KaraokeSongAsset[] = []

    for (const entry of entries) {
      if (!entry.isDirectory() || !isSafeKaraokeSongId(entry.name))
        continue
      const directory = join(songsRoot, entry.name)
      const manifest = await readManifest(directory)
      if (!manifest)
        continue
      const size = await songSize(directory, manifest)
      if (size === undefined)
        continue
      const info = await stat(directory)
      const durationSec = manifest.durationSec
        ?? await probeWavDuration(join(directory, manifest.audio))
        ?? 0
      assets.push({
        id: entry.name,
        name: manifest.title,
        size,
        importedAt: info.mtime.toISOString(),
        durationSec,
        bpm: manifest.bpm,
        hasLyrics: Boolean(manifest.lyrics),
        hasVisemes: Boolean(manifest.visemes),
        hasStems: Boolean(manifest.vocal && manifest.instrumental),
      })
    }

    return assets.sort((a, b) => a.name.localeCompare(b.name))
  }

  defineInvokeHandler(context, electronKaraokeSongsList, listSongs)

  defineInvokeHandler(context, electronKaraokeSongRead, async ({ id, file }: { id: string, file: KaraokeSongFile }) => {
    if (!isSafeKaraokeSongId(id))
      throw new Error('Invalid karaoke song id.')
    const directory = join(songsRoot, id)
    const manifest = await readManifest(directory)
    if (!manifest)
      throw new Error(`Karaoke song not found: ${id}`)

    const name = file === 'manifest' ? KARAOKE_MANIFEST_FILE : karaokeFileFor(manifest, file)
    if (!name)
      throw new Error(`Karaoke song ${id} has no ${file} file.`)

    const bytes = await readFile(join(directory, name))
    return new Uint8Array(bytes).buffer
  })

  defineInvokeHandler(context, electronKaraokeSongRemove, async (id) => {
    if (!isSafeKaraokeSongId(id))
      return
    await rm(join(songsRoot, id), { recursive: true, force: true })
  })

  defineInvokeHandler(context, electronKaraokeSongReveal, async () => {
    await mkdir(songsRoot, { recursive: true })
    const error = await shell.openPath(root)
    if (error)
      throw new Error(error)
  })
}
