import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { VrmAnimationAsset } from '@proj-airi/stage-shared/vrm-animations'

import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import {
  electronVrmAnimationImport,
  electronVrmAnimationRead,
  electronVrmAnimationRemove,
  electronVrmAnimationReveal,
  electronVrmAnimationsList,
} from '@proj-airi/stage-shared/vrm-animations'
import { app, shell } from 'electron'

const LIBRARY_VERSION = 1
const MAX_ANIMATION_BYTES = 100 * 1024 * 1024
const GLB_MAGIC = [0x67, 0x6C, 0x54, 0x46]

interface AnimationLibraryFile {
  version: number
  assets: VrmAnimationAsset[]
}

function isSafeAssetId(id: string): boolean {
  return id.length > 0 && id !== '.' && id !== '..' && !id.includes('/') && !id.includes('\\')
}

function isVrmAnimationAsset(value: unknown): value is VrmAnimationAsset {
  if (!value || typeof value !== 'object')
    return false
  const asset = value as Partial<VrmAnimationAsset>
  return typeof asset.id === 'string'
    && isSafeAssetId(asset.id)
    && typeof asset.name === 'string'
    && asset.name.length > 0
    && typeof asset.size === 'number'
    && Number.isFinite(asset.size)
    && asset.size > 0
    && typeof asset.importedAt === 'string'
}

function displayNameFromFile(name: string): string {
  const withoutExtension = name.split('/').pop()?.replace(/\.vrma$/i, '').trim() ?? ''
  const cleaned = Array.from(withoutExtension)
    .filter(char => char.charCodeAt(0) >= 0x20 && char.charCodeAt(0) !== 0x7F)
    .join('')
    .trim()
  return cleaned.slice(0, 120) || 'Animation'
}

/**
 * Owns user-local VRM animations under `userData/vrm-animations`.
 *
 * The renderer selects files with its file picker and sends the bytes here.
 * Files never enter the application bundle, and the renderer reads them back
 * only through the asset ID that this store issues.
 */
export function setupVrmAnimations(context: ReturnType<typeof createContext>['context']): void {
  const root = join(app.getPath('userData'), 'vrm-animations')
  const assetsDirectory = join(root, 'assets')
  const libraryPath = join(root, 'library.json')

  async function ensureDirectories() {
    await mkdir(assetsDirectory, { recursive: true })
  }

  async function readLibrary(): Promise<VrmAnimationAsset[]> {
    await ensureDirectories()
    try {
      const parsed = JSON.parse(await readFile(libraryPath, 'utf8')) as Partial<AnimationLibraryFile> | VrmAnimationAsset[] | null
      const assets = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray(parsed.assets)
          ? parsed.assets
          : []
      return assets.filter(isVrmAnimationAsset)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT' || error instanceof SyntaxError)
        return []
      throw error
    }
  }

  async function writeLibrary(assets: VrmAnimationAsset[]) {
    await ensureDirectories()
    await writeFile(libraryPath, JSON.stringify({
      version: LIBRARY_VERSION,
      assets,
    } satisfies AnimationLibraryFile, null, 2))
  }

  async function listInstalledAssets(): Promise<VrmAnimationAsset[]> {
    const assets = await readLibrary()
    const installed: VrmAnimationAsset[] = []
    const knownIds = new Set(assets.map(asset => asset.id))
    let changed = false
    for (const asset of assets) {
      try {
        const info = await stat(join(assetsDirectory, `${asset.id}.vrma`))
        if (info.isFile() && info.size > 0) {
          installed.push({ ...asset, size: info.size })
        }
        else {
          changed = true
        }
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT')
          throw error
        changed = true
      }
    }

    // Files copied into the folder by hand become library entries too.
    for (const entry of await readdir(assetsDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.vrma'))
        continue
      const id = entry.name.slice(0, -'.vrma'.length)
      if (knownIds.has(id))
        continue
      const info = await stat(join(assetsDirectory, entry.name))
      if (info.size === 0)
        continue
      installed.push({
        id,
        name: displayNameFromFile(entry.name),
        size: info.size,
        importedAt: info.mtime.toISOString(),
      })
      changed = true
    }

    if (changed)
      await writeLibrary(installed)

    return installed.sort((a, b) => a.name.localeCompare(b.name))
  }

  defineInvokeHandler(context, electronVrmAnimationsList, listInstalledAssets)

  defineInvokeHandler(context, electronVrmAnimationImport, async (payload) => {
    if (!(payload.data instanceof ArrayBuffer))
      throw new TypeError('VRM animation data must be an ArrayBuffer.')
    if (payload.data.byteLength === 0 || payload.data.byteLength > MAX_ANIMATION_BYTES)
      throw new Error('VRM animation must be between 1 byte and 100 MB.')

    const bytes = new Uint8Array(payload.data)
    if (GLB_MAGIC.some((value, index) => bytes[index] !== value))
      throw new Error('The selected file is not a VRMA/GLB animation.')

    const id = randomUUID()
    const asset: VrmAnimationAsset = {
      id,
      name: displayNameFromFile(payload.name),
      size: bytes.byteLength,
      importedAt: new Date().toISOString(),
    }
    const filePath = join(assetsDirectory, `${id}.vrma`)

    await ensureDirectories()
    await writeFile(filePath, bytes)
    try {
      const assets = await readLibrary()
      await writeLibrary([...assets, asset])
    }
    catch (error) {
      await rm(filePath, { force: true })
      throw error
    }

    return asset
  })

  defineInvokeHandler(context, electronVrmAnimationRead, async (id) => {
    const asset = (await readLibrary()).find(candidate => candidate.id === id)
    if (!asset)
      throw new Error(`VRM animation asset not found: ${id}`)
    const bytes = await readFile(join(assetsDirectory, `${asset.id}.vrma`))
    return new Uint8Array(bytes).buffer
  })

  defineInvokeHandler(context, electronVrmAnimationRemove, async (id) => {
    const assets = await readLibrary()
    if (!assets.some(asset => asset.id === id))
      return
    await rm(join(assetsDirectory, `${id}.vrma`), { force: true })
    await writeLibrary(assets.filter(asset => asset.id !== id))
  })

  defineInvokeHandler(context, electronVrmAnimationReveal, async () => {
    await ensureDirectories()
    const error = await shell.openPath(root)
    if (error)
      throw new Error(error)
  })
}
