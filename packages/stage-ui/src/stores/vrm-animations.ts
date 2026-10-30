import type { VrmAnimationAsset, VrmAnimationBindings } from '@proj-airi/stage-shared/vrm-animations'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFrom } from '@moeru/std'
import { isElectronWindow } from '@proj-airi/stage-shared'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import {
  electronVrmAnimationImport,
  electronVrmAnimationRead,
  electronVrmAnimationRemove,
  electronVrmAnimationReveal,
  electronVrmAnimationsList,
} from '@proj-airi/stage-shared/vrm-animations'
import { useBroadcastChannel } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'

interface VrmAnimationBindingBroadcast {
  avatarModelId: string
  animations: VrmAnimationBindings
}

const BINDING_CHANNEL = 'airi-vrm-animation-bindings'

/**
 * Reads the desktop VRM animation library from the main process.
 *
 * The settings window imports files into `userData/vrm-animations`, while the
 * stage window reads them back by ID. Both windows create their own store and
 * eventa context because Electron runs them in separate renderers.
 */
export const useVrmAnimationsStore = defineStore('vrm-animations', () => {
  const assets = ref<VrmAnimationAsset[]>([])
  const loading = ref(false)
  const error = ref<string>()
  const bindingsByModel = useLocalStorageManualReset<Record<string, VrmAnimationBindings>>(
    'settings/vrm/animation-bindings',
    () => ({}),
  )
  const objectUrls = new Map<string, string>()
  let context: ReturnType<typeof createContext> | undefined
  const { data: incomingBindings, post: postBindings } = useBroadcastChannel<VrmAnimationBindingBroadcast, VrmAnimationBindingBroadcast>({
    name: BINDING_CHANNEL,
  })

  watch(incomingBindings, (payload) => {
    if (payload)
      bindingsByModel.value = { ...bindingsByModel.value, [payload.avatarModelId]: payload.animations }
  })

  const supported = computed(() => typeof window !== 'undefined' && isElectronWindow(window))

  function getContext() {
    if (typeof window === 'undefined' || !isElectronWindow(window))
      throw new Error('VRM animation imports require the desktop app.')
    context ??= createContext(window.electron.ipcRenderer)
    return context.context
  }

  async function refresh() {
    if (!supported.value) {
      assets.value = []
      return
    }

    loading.value = true
    error.value = undefined
    try {
      assets.value = await defineInvoke(getContext(), electronVrmAnimationsList)()
    }
    catch (cause) {
      error.value = errorMessageFrom(cause)
    }
    finally {
      loading.value = false
    }
  }

  async function importAnimation(file: File) {
    if (!file.name.toLowerCase().endsWith('.vrma'))
      throw new Error('Select a .vrma file.')
    if (!supported.value)
      throw new Error('VRM animation imports require the desktop app.')

    const asset = await defineInvoke(getContext(), electronVrmAnimationImport)({
      name: file.name,
      data: await file.arrayBuffer(),
    })
    assets.value = [...assets.value, asset].sort((a, b) => a.name.localeCompare(b.name))
    return asset
  }

  async function removeAnimation(id: string) {
    if (!supported.value)
      return
    await defineInvoke(getContext(), electronVrmAnimationRemove)(id)
    const url = objectUrls.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      objectUrls.delete(id)
    }
    assets.value = assets.value.filter(asset => asset.id !== id)
  }

  async function getAnimationUrl(id: string): Promise<string | undefined> {
    if (!id || !supported.value)
      return undefined

    const cached = objectUrls.get(id)
    if (cached)
      return cached

    try {
      const data = await defineInvoke(getContext(), electronVrmAnimationRead)(id)
      const url = URL.createObjectURL(new Blob([data], { type: 'model/gltf-binary' }))
      objectUrls.set(id, url)
      return url
    }
    catch (cause) {
      console.warn(`[VRM] animation ${id} could not be read`, errorMessageFrom(cause))
      return undefined
    }
  }

  async function reveal() {
    if (!supported.value)
      return
    await defineInvoke(getContext(), electronVrmAnimationReveal)()
  }

  /** Updates every window and persists the binding for this display model. */
  function setBindings(modelId: string, animations: VrmAnimationBindings) {
    bindingsByModel.value = { ...bindingsByModel.value, [modelId]: animations }
    postBindings({ avatarModelId: modelId, animations })
  }

  /** Prefers the live settings window value, then the value stored on the card. */
  function resolveBindings(modelId: string | undefined, fallback: VrmAnimationBindings): VrmAnimationBindings {
    if (!modelId)
      return fallback
    return bindingsByModel.value[modelId] ?? fallback
  }

  function reset() {
    for (const url of objectUrls.values())
      URL.revokeObjectURL(url)
    objectUrls.clear()
    assets.value = []
    bindingsByModel.reset()
    error.value = undefined
  }

  onScopeDispose(() => {
    context?.dispose()
    context = undefined
  })

  return {
    assets,
    loading,
    error,
    supported,
    refresh,
    importAnimation,
    removeAnimation,
    getAnimationUrl,
    reveal,
    setBindings,
    resolveBindings,
    reset,
  }
})
