import type {
  VrmAttachmentAsset,
  VrmAttachmentBinding,
  VrmAttachmentFormat,
  VrmAttachmentTransform,
  VrmResolvedAttachment,
} from '@proj-airi/stage-shared/vrm-attachments'

import localforage from 'localforage'

import { errorMessageFrom } from '@moeru/std'
import { DEFAULT_VRM_ATTACHMENT_TRANSFORM, vrmAttachmentFormatFromFileName } from '@proj-airi/stage-shared/vrm-attachments'
import { useLocalStorage } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { onScopeDispose, reactive, ref, watch } from 'vue'

const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024
const ASSET_STORE_NAME = 'airi-vrm-attachments'

const attachmentFiles = localforage.createInstance({
  name: ASSET_STORE_NAME,
  storeName: 'assets',
})

function fileKey(assetId: string) {
  return `vrm-attachment:${assetId}`
}

function formatName(format: VrmAttachmentFormat) {
  return format.toUpperCase()
}

export const useVrmAttachmentsStore = defineStore('vrm-attachments', () => {
  const assets = useLocalStorage<VrmAttachmentAsset[]>('settings/vrm/attachment-assets', [])
  const bindingsByModel = useLocalStorage<Record<string, VrmAttachmentBinding[]>>(
    'settings/vrm/attachment-bindings',
    {},
  )
  const assetUrls = reactive<Record<string, string>>({})
  const loading = ref(false)
  const error = ref<string>()
  let hydration: Promise<void> | undefined

  function upsertAsset(asset: VrmAttachmentAsset) {
    const index = assets.value.findIndex(candidate => candidate.id === asset.id)
    if (index === -1)
      assets.value = [...assets.value, asset]
    else
      assets.value = assets.value.map(candidate => candidate.id === asset.id ? asset : candidate)
  }

  function createAssetUrl(assetId: string, blob: Blob) {
    assetUrls[assetId] = URL.createObjectURL(blob)
  }

  async function hydrateAssetUrls() {
    if (hydration)
      return hydration

    hydration = (async () => {
      loading.value = true
      error.value = undefined
      try {
        const known = new Set(assets.value.map(asset => asset.id))
        for (const [assetId, url] of Object.entries(assetUrls)) {
          if (known.has(assetId))
            continue
          URL.revokeObjectURL(url)
          delete assetUrls[assetId]
        }
        for (const asset of assets.value) {
          if (assetUrls[asset.id])
            continue
          const blob = await attachmentFiles.getItem<Blob>(fileKey(asset.id))
          if (blob)
            createAssetUrl(asset.id, blob)
        }
      }
      catch (cause) {
        error.value = errorMessageFrom(cause) ?? 'Failed to initialize attachments'
      }
      finally {
        loading.value = false
        hydration = undefined
      }
    })()

    return hydration
  }

  function initialize() {
    return hydrateAssetUrls()
  }

  watch(assets, () => {
    void hydrateAssetUrls()
  }, { deep: true, immediate: true })

  async function importAsset(file: File) {
    const format = vrmAttachmentFormatFromFileName(file.name)
    if (!format)
      throw new Error('Select a .glb or .vrm attachment.')
    if (file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES)
      throw new Error('Attachment files must be between 1 byte and 100 MB.')

    const id = nanoid()
    await attachmentFiles.setItem(fileKey(id), file)
    const asset: VrmAttachmentAsset = {
      id,
      name: file.name.replace(/\.(?:glb|vrm)$/i, '').trim() || file.name,
      format,
      fileName: file.name,
      byteSize: file.size,
      importedAt: Date.now(),
    }
    createAssetUrl(id, file)
    upsertAsset(asset)
    return asset
  }

  async function removeAsset(assetId: string) {
    const url = assetUrls[assetId]
    if (url)
      URL.revokeObjectURL(url)
    delete assetUrls[assetId]
    await attachmentFiles.removeItem(fileKey(assetId))
    assets.value = assets.value.filter(asset => asset.id !== assetId)
    bindingsByModel.value = Object.fromEntries(
      Object.entries(bindingsByModel.value).map(([modelId, bindings]) => [
        modelId,
        bindings.filter(binding => binding.assetId !== assetId),
      ]),
    )
  }

  function getBindings(modelId: string) {
    return bindingsByModel.value[modelId] ?? []
  }

  function setBindings(modelId: string, bindings: VrmAttachmentBinding[]) {
    bindingsByModel.value = {
      ...bindingsByModel.value,
      [modelId]: bindings,
    }
  }

  function addBinding(modelId: string, assetId: string, overrides?: Partial<VrmAttachmentBinding>) {
    const binding: VrmAttachmentBinding = {
      id: nanoid(),
      assetId,
      bone: 'head',
      transform: {
        ...DEFAULT_VRM_ATTACHMENT_TRANSFORM,
        position: [...DEFAULT_VRM_ATTACHMENT_TRANSFORM.position],
        rotation: [...DEFAULT_VRM_ATTACHMENT_TRANSFORM.rotation],
      },
      visible: true,
      hideMeshIds: [],
      ...overrides,
    }
    setBindings(modelId, [...getBindings(modelId), binding])
    return binding
  }

  function updateBinding(
    modelId: string,
    bindingId: string,
    updates: Partial<Omit<VrmAttachmentBinding, 'id' | 'assetId'>>,
  ) {
    setBindings(modelId, getBindings(modelId).map(binding => binding.id === bindingId
      ? {
          ...binding,
          ...updates,
          transform: updates.transform
            ? {
                ...binding.transform,
                ...updates.transform,
                position: [...updates.transform.position],
                rotation: [...updates.transform.rotation],
              }
            : binding.transform,
        }
      : binding))
  }

  function removeBinding(modelId: string, bindingId: string) {
    setBindings(modelId, getBindings(modelId).filter(binding => binding.id !== bindingId))
  }

  function toggleBinding(modelId: string, bindingId: string) {
    const binding = getBindings(modelId).find(candidate => candidate.id === bindingId)
    if (binding)
      updateBinding(modelId, bindingId, { visible: !binding.visible })
  }

  function setBindingTransform(modelId: string, bindingId: string, transform: VrmAttachmentTransform) {
    updateBinding(modelId, bindingId, { transform })
  }

  function resolveAttachments(modelId: string, includeHidden = true): VrmResolvedAttachment[] {
    return getBindings(modelId).flatMap((binding) => {
      if (!includeHidden && !binding.visible)
        return []
      const asset = assets.value.find(candidate => candidate.id === binding.assetId)
      const url = assetUrls[binding.assetId]
      if (!asset || !url)
        return []
      return [{
        ...binding,
        name: asset.name,
        format: asset.format,
        url,
      }]
    })
  }

  onScopeDispose(() => {
    for (const url of Object.values(assetUrls))
      URL.revokeObjectURL(url)
  })

  return {
    assets,
    bindingsByModel,
    assetUrls,
    loading,
    error,
    formatName,
    initialize,
    importAsset,
    removeAsset,
    getBindings,
    setBindings,
    addBinding,
    updateBinding,
    removeBinding,
    toggleBinding,
    setBindingTransform,
    resolveAttachments,
  }
})
