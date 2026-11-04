<script setup lang="ts">
import type { VrmAttachmentBinding, VrmAttachmentBone } from '@proj-airi/stage-shared/vrm-attachments'

import { errorMessageFrom } from '@moeru/std'
import { VRM_ATTACHMENT_BONES } from '@proj-airi/stage-shared/vrm-attachments'
import { Button, Callout, GhostButton } from '@proj-airi/ui'
import { useFileDialog } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useVrmAttachmentsStore } from '../../../../stores/vrm-attachments'
import { Container, PropertyNumber, PropertyPoint } from '../../../data-pane'

const props = defineProps<{
  modelId: string
}>()

const { t } = useI18n()
const store = useVrmAttachmentsStore()
const selectedAssetId = ref<string>()
const attachmentLibraryOpen = ref(false)
const busy = ref(false)
const error = ref<string>()

const assets = computed(() => store.assets)
const bindings = computed(() => store.getBindings(props.modelId))
const positionConfig = { min: -2, max: 2, step: 0.01, precision: 2 }
const rotationConfig = { min: -180, max: 180, step: 1, precision: 0 }
const scaleConfig = { min: 0.01, max: 10, step: 0.01, precision: 2 }
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

function updatePosition(binding: VrmAttachmentBinding, axis: number, value: string | number) {
  const position = [...binding.transform.position] as [number, number, number]
  position[axis] = Number(value) || 0
  store.updateBinding(props.modelId, binding.id, {
    transform: { ...binding.transform, position },
  })
}

function updateRotation(binding: VrmAttachmentBinding, axis: number, value: string | number) {
  const rotation = [...binding.transform.rotation] as [number, number, number]
  rotation[axis] = Number(value) || 0
  store.updateBinding(props.modelId, binding.id, {
    transform: { ...binding.transform, rotation },
  })
}

function updateScale(binding: VrmAttachmentBinding, value: string | number) {
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

    <Callout v-if="!assets.length" :label="t('settings.vrm.attachments.title')">
      <div :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-400']">
        {{ t('settings.vrm.attachments.empty') }}
      </div>
    </Callout>

    <section
      v-if="assets.length"
      :class="['mt-4', 'border-2', 'border-neutral-200', 'rounded-xl', 'px-3', 'py-3', 'dark:border-neutral-800']"
    >
      <div :class="['text-xs', 'font-semibold', 'text-neutral-600', 'dark:text-neutral-300']">
        {{ t('settings.vrm.attachments.model-title') }}
      </div>

      <div :class="['mt-2', 'flex', 'flex-wrap', 'items-center', 'gap-2']">
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

      <div :class="['mt-3', 'flex', 'flex-col', 'gap-3']">
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
              {{ t('settings.vrm.attachments.remove-from-model') }}
            </GhostButton>
          </div>

          <details :class="['mt-2']">
            <summary :class="['cursor-pointer', 'text-[10px]', 'font-medium', 'text-neutral-500', 'dark:text-neutral-400']">
              {{ t('settings.vrm.attachments.options') }}
            </summary>

            <label :class="['mt-2', 'block', 'text-[10px]', 'text-neutral-500']">
              {{ t('settings.vrm.attachments.bone') }}
              <select
                :value="binding.bone"
                :class="['mt-1', 'w-full', 'border', 'border-neutral-300', 'rounded-md', 'bg-white', 'px-2', 'py-1', 'text-xs', 'dark:border-neutral-700', 'dark:bg-neutral-900']"
                @change="store.updateBinding(modelId, binding.id, { bone: ($event.target as HTMLSelectElement).value as VrmAttachmentBone })"
              >
                <option v-for="bone in VRM_ATTACHMENT_BONES" :key="bone" :value="bone">{{ bone }}</option>
              </select>
            </label>

            <div grid="~ cols-5 gap-1" :class="['mt-2']">
              <PropertyNumber
                :model-value="binding.transform.scale"
                :config="scaleConfig"
                :label="t('settings.vrm.attachments.scale')"
                :scrub="false"
                @update:model-value="updateScale(binding, $event)"
              />
            </div>

            <div grid="~ cols-5 gap-1" :class="['mt-2']">
              <PropertyPoint
                :label="t('settings.vrm.attachments.position')"
                :x="binding.transform.position[0]"
                :y="binding.transform.position[1]"
                :z="binding.transform.position[2]"
                :x-config="positionConfig"
                :y-config="positionConfig"
                :z-config="positionConfig"
                @update:x="updatePosition(binding, 0, $event)"
                @update:y="updatePosition(binding, 1, $event)"
                @update:z="updatePosition(binding, 2, $event)"
              />
              <PropertyPoint
                :label="t('settings.vrm.attachments.rotation')"
                :x="binding.transform.rotation[0]"
                :y="binding.transform.rotation[1]"
                :z="binding.transform.rotation[2]"
                :x-config="rotationConfig"
                :y-config="rotationConfig"
                :z-config="rotationConfig"
                @update:x="updateRotation(binding, 0, $event)"
                @update:y="updateRotation(binding, 1, $event)"
                @update:z="updateRotation(binding, 2, $event)"
              />
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
          </details>
        </div>
      </div>
    </section>

    <section
      v-if="assets.length"
      :class="['mt-5', 'border-2', 'border-neutral-200', 'rounded-xl', 'bg-neutral-50/70', 'dark:border-neutral-800', 'dark:bg-neutral-900/40']"
    >
      <button
        type="button"
        :aria-expanded="attachmentLibraryOpen"
        :class="['w-full', 'flex', 'items-center', 'gap-3', 'px-3', 'py-3', 'text-left']"
        @click="attachmentLibraryOpen = !attachmentLibraryOpen"
      >
        <span :class="['size-9', 'flex', 'shrink-0', 'items-center', 'justify-center', 'rounded-lg', 'bg-primary-100', 'text-primary-600', 'dark:bg-primary-900/40', 'dark:text-primary-300']">
          <span :class="['i-solar:folder-with-files-bold-duotone', 'text-lg']" aria-hidden="true" />
        </span>
        <span :class="['min-w-0', 'flex-1']">
          <span :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
            <span :class="['text-sm', 'font-medium']">{{ t('settings.vrm.attachments.library') }}</span>
            <span :class="['border', 'border-neutral-200', 'rounded-full', 'bg-white', 'px-2', 'py-0.5', 'text-xs', 'text-neutral-600', 'dark:border-neutral-700', 'dark:bg-neutral-800', 'dark:text-neutral-300']">
              {{ assets.length }}
            </span>
          </span>
          <span :class="['mt-0.5', 'block', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ t('settings.vrm.attachments.library-description') }}
          </span>
        </span>
        <span
          :class="['i-solar:alt-arrow-down-linear', 'shrink-0', 'text-lg', 'text-neutral-500', 'transition-transform', 'duration-200', 'dark:text-neutral-400', attachmentLibraryOpen ? 'rotate-180' : '']"
          aria-hidden="true"
        />
      </button>
      <div
        v-if="attachmentLibraryOpen"
        :class="['flex', 'flex-col', 'gap-2', 'border-t', 'border-neutral-200', 'px-3', 'pb-3', 'pt-3', 'dark:border-neutral-800']"
      >
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
            {{ t('settings.vrm.attachments.delete-file') }}
          </GhostButton>
        </div>
      </div>
    </section>
  </Container>
</template>
