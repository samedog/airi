import type { VrmAnimationAsset } from '@proj-airi/stage-shared/vrm-animations'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { watch } from 'vue'

function normalizeAssets(value: unknown): VrmAnimationAsset[] {
  if (!Array.isArray(value))
    return []
  return value.filter((asset): asset is VrmAnimationAsset =>
    !!asset
    && typeof asset === 'object'
    && typeof asset.id === 'string'
    && typeof asset.name === 'string'
    && typeof asset.size === 'number'
    && Number.isFinite(asset.size)
    && typeof asset.importedAt === 'string',
  )
}

function sortAssets(assets: readonly VrmAnimationAsset[]) {
  return [...assets].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Persists the animation names that the settings window has seen.
 *
 * This is intentionally separate from the file library. The system prompt is
 * composed in the chat and stage windows, which must not need an Electron IPC
 * round trip before they can list available motion names.
 */
export const useVrmAnimationCatalogStore = defineStore('vrm-animation-catalog', () => {
  const assets = useLocalStorageManualReset<VrmAnimationAsset[]>(
    'settings/vrm/animation-catalog',
    () => [],
  )

  watch(assets, (value) => {
    const normalized = sortAssets(normalizeAssets(value))
    if (JSON.stringify(normalized) !== JSON.stringify(value))
      assets.value = normalized
  }, { immediate: true })

  function replace(next: readonly VrmAnimationAsset[]) {
    assets.value = sortAssets(normalizeAssets(next))
  }

  function add(asset: VrmAnimationAsset) {
    assets.value = sortAssets(normalizeAssets([
      ...assets.value.filter(candidate => candidate.id !== asset.id),
      asset,
    ]))
  }

  function remove(id: string) {
    assets.value = assets.value.filter(asset => asset.id !== id)
  }

  function reset() {
    assets.reset()
  }

  return {
    assets,
    replace,
    add,
    remove,
    reset,
  }
})
