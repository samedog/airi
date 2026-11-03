<script setup lang="ts">
import type { VrmAttachmentBinding, VrmAttachmentBone } from '@proj-airi/stage-shared/vrm-attachments'

import { errorMessageFrom } from '@moeru/std'
import { VRM_ATTACHMENT_BONES } from '@proj-airi/stage-shared/vrm-attachments'
import { Button, Callout, GhostButton } from '@proj-airi/ui'
import { useFileDialog } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useVrmAttachmentsStore } from '../../../../stores/vrm-attachments'
import { Container } from '../../../data-pane'

const props = defineProps<{
  modelId: string
}>()

const { t } = useI18n()
const store = useVrmAttachmentsStore()
const selectedAssetId = ref<string>()
const busy = ref(false)
const error = ref<string>()

const assets = computed(() => store.assets)
const bindings = computed(() => store.getBindings(props.modelId))
const fileDialog = useFileDialog({ accept: '.glb,.vrm', multiple: true, reset: true })

fileDialog.onChange(async (files) => {
  if (!files?.length)
    return
  busy.value = true
  error.value = undefined
  try {
    for (const file of Array.from(files)) {
      const asset = await store.importAsset(file)
      selectedAssetId.value = asset.id
    }
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? 'Failed to import attachment'
  }
  finally {
    busy.value = false
  }
})

onMounted(() => {
  void store.initialize()
})

function assetName(assetId: string) {
  return assets.value.find(asset => asset.id === assetId)?.name ?? assetId
}

function assetFormat(assetId: string) {
  const asset = assets.value.find(candidate => candidate.id === assetId)
  return asset ? store.formatName(asset.format) : ''
}

function addBinding() {
  if (selectedAssetId.value)
    store.addBinding(props.modelId, selectedAssetId.value)
}

function updatePosition(binding: VrmAttachmentBinding, axis: number, value: string) {
  const position = [...binding.transform.position] as [number, number, number]
  position[axis] = Number(value) || 0
  store.updateBinding(props.modelId, binding.id, {
    transform: { ...binding.transform, position },
  })
}

function updateRotation(binding: VrmAttachmentBinding, axis: number, value: string) {
  const rotation = [...binding.transform.rotation] as [number, number, number]
  rotation[axis] = Number(value) || 0
  store.updateBinding(props.modelId, binding.id, {
    transform: { ...binding.transform, rotation },
  })
}

function updateScale(binding: VrmAttachmentBinding, value: string) {
  store.updateBinding(props.modelId, binding.id, {
    transform: { ...binding.transform, scale: Number(value) || 1 },
  })
}

function updateHideMeshIds(binding: VrmAttachmentBinding, value: string) {
  const hideMeshIds = value.split(/[\s,]+/).map(part => part.trim()).filter(Boolean)
  store.updateBinding(props.modelId, binding.id, { hideMeshIds })
}
</script>

<template>
  <Container
    :title="t('settings.vrm.attachments.title')"
    icon="i-solar:paperclip-bold-duotone"
    :class="['rounded-xl', 'bg-white/80 dark:bg-black/75', 'backdrop-blur-lg']"
  >
    <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.vrm.attachments.description') }}
    </p>

    <div :class="['mt-2', 'flex', 'flex-wrap', 'items-center', 'gap-2']">
      <Button :disabled="busy" @click="fileDialog.open()">
        {{ t('settings.vrm.attachments.import') }}
      </Button>
      <GhostButton :disabled="store.loading" @click="store.initialize()">
        {{ t('settings.vrm.attachments.refresh') }}
      </GhostButton>
    </div>

    <p v-if="error || store.error" :class="['mt-2', 'text-xs', 'text-red-500']">
      {{ error || store.error }}
    </p>

    <div v-if="assets.length" :class="['mt-3', 'flex', 'flex-col', 'gap-2']">
      <div
        v-for="asset in assets"
        :key="asset.id"
        :class="['flex', 'items-center', 'gap-2', 'border', 'border-neutral-200/70', 'rounded-lg', 'px-2', 'py-1.5', 'dark:border-neutral-700/70']"
      >
        <div :class="['min-w-0', 'flex-1']">
          <div :class="['truncate', 'text-xs', 'font-medium']">
            {{ asset.name }}
          </div>
          <div :class="['text-[10px]', 'text-neutral-500']">
            {{ store.formatName(asset.format) }} · {{ Math.ceil(asset.byteSize / 1024) }} KB
          </div>
        </div>
        <GhostButton size="sm" :disabled="busy" @click="store.removeAsset(asset.id)">
          {{ t('settings.vrm.attachments.remove') }}
        </GhostButton>
      </div>
    </div>
    <Callout v-else :label="t('settings.vrm.attachments.title')">
      <div :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-400']">
        {{ t('settings.vrm.attachments.empty') }}
      </div>
    </Callout>

    <div :class="['mt-4', 'flex', 'flex-wrap', 'items-center', 'gap-2']">
      <select
        v-model="selectedAssetId"
        :class="['min-w-48', 'border', 'border-neutral-300', 'rounded-md', 'bg-white', 'px-2', 'py-1.5', 'text-xs', 'dark:border-neutral-700', 'dark:bg-neutral-900']"
      >
        <option :value="undefined">
          {{ t('settings.vrm.attachments.select-asset') }}
        </option>
        <option v-for="asset in assets" :key="asset.id" :value="asset.id">
          {{ asset.name }}
        </option>
      </select>
      <Button :disabled="!selectedAssetId || !modelId" @click="addBinding">
        {{ t('settings.vrm.attachments.add') }}
      </Button>
    </div>

    <div :class="['mt-4', 'flex', 'flex-col', 'gap-3']">
      <div
        v-for="binding in bindings"
        :key="binding.id"
        :class="['border', 'border-neutral-200/70', 'rounded-xl', 'p-3', 'dark:border-neutral-700/70']"
      >
        <div :class="['flex', 'items-center', 'gap-2']">
          <div :class="['min-w-0', 'flex-1', 'truncate', 'text-xs', 'font-medium']">
            {{ assetName(binding.assetId) }}
            <span :class="['text-neutral-400']">({{ assetFormat(binding.assetId) }})</span>
          </div>
          <GhostButton size="sm" @click="store.toggleBinding(modelId, binding.id)">
            {{ binding.visible ? t('settings.vrm.attachments.hide') : t('settings.vrm.attachments.show') }}
          </GhostButton>
          <GhostButton size="sm" @click="store.removeBinding(modelId, binding.id)">
            {{ t('settings.vrm.attachments.remove') }}
          </GhostButton>
        </div>

        <div :class="['mt-2', 'grid', 'grid-cols-2', 'gap-2']">
          <label :class="['text-[10px]', 'text-neutral-500']">
            {{ t('settings.vrm.attachments.bone') }}
            <select
              :value="binding.bone"
              :class="['mt-1', 'w-full', 'border', 'border-neutral-300', 'rounded-md', 'bg-white', 'px-2', 'py-1', 'text-xs', 'dark:border-neutral-700', 'dark:bg-neutral-900']"
              @change="store.updateBinding(modelId, binding.id, { bone: ($event.target as HTMLSelectElement).value as VrmAttachmentBone })"
            >
              <option v-for="bone in VRM_ATTACHMENT_BONES" :key="bone" :value="bone">{{ bone }}</option>
            </select>
          </label>
          <label :class="['text-[10px]', 'text-neutral-500']">
            {{ t('settings.vrm.attachments.scale') }}
            <input
              type="number"
              step="0.01"
              :value="binding.transform.scale"
              :class="['mt-1', 'w-full', 'border', 'border-neutral-300', 'rounded-md', 'bg-white', 'px-2', 'py-1', 'text-xs', 'dark:border-neutral-700', 'dark:bg-neutral-900']"
              @input="updateScale(binding, ($event.target as HTMLInputElement).value)"
            >
          </label>
        </div>

        <div :class="['mt-2', 'grid', 'grid-cols-3', 'gap-2']">
          <label v-for="(axis, index) in ['X', 'Y', 'Z']" :key="`p-${axis}`" :class="['text-[10px]', 'text-neutral-500']">
            {{ t('settings.vrm.attachments.position') }} {{ axis }}
            <input
              type="number"
              step="0.01"
              :value="binding.transform.position[index]"
              :class="['mt-1', 'w-full', 'border', 'border-neutral-300', 'rounded-md', 'bg-white', 'px-2', 'py-1', 'text-xs', 'dark:border-neutral-700', 'dark:bg-neutral-900']"
              @input="updatePosition(binding, index, ($event.target as HTMLInputElement).value)"
            >
          </label>
        </div>

        <div :class="['mt-2', 'grid', 'grid-cols-3', 'gap-2']">
          <label v-for="(axis, index) in ['X', 'Y', 'Z']" :key="`r-${axis}`" :class="['text-[10px]', 'text-neutral-500']">
            {{ t('settings.vrm.attachments.rotation') }} {{ axis }}
            <input
              type="number"
              step="1"
              :value="binding.transform.rotation[index]"
              :class="['mt-1', 'w-full', 'border', 'border-neutral-300', 'rounded-md', 'bg-white', 'px-2', 'py-1', 'text-xs', 'dark:border-neutral-700', 'dark:bg-neutral-900']"
              @input="updateRotation(binding, index, ($event.target as HTMLInputElement).value)"
            >
          </label>
        </div>

        <label :class="['mt-2', 'block', 'text-[10px]', 'text-neutral-500']">
          {{ t('settings.vrm.attachments.hide-meshes') }}
          <input
            type="text"
            :value="binding.hideMeshIds.join(', ')"
            :placeholder="t('settings.vrm.attachments.hide-meshes-placeholder')"
            :class="['mt-1', 'w-full', 'border', 'border-neutral-300', 'rounded-md', 'bg-white', 'px-2', 'py-1', 'text-xs', 'dark:border-neutral-700', 'dark:bg-neutral-900']"
            @change="updateHideMeshIds(binding, ($event.target as HTMLInputElement).value)"
          >
        </label>
      </div>
    </div>
  </Container>
</template>
