import type { VrmAnimationAsset } from '@proj-airi/stage-shared/vrm-animations'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

function sortAssets(assets: VrmAnimationAsset[]) {
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

  function replace(next: readonly VrmAnimationAsset[]) {
    assets.value = sortAssets([...next])
  }

  function add(asset: VrmAnimationAsset) {
    assets.value = sortAssets([
      ...assets.value.filter(candidate => candidate.id !== asset.id),
      asset,
    ])
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
