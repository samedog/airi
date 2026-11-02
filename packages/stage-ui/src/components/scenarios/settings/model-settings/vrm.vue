<script setup lang="ts">
import type { VrmAnimationAsset, VrmAnimationBindings, VrmAnimationClipBinding, VrmAnimationSlot } from '@proj-airi/stage-shared/vrm-animations'

import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { errorMessageFrom } from '@moeru/std'
import { VRM_ANIMATION_ENERGY_CALM, VRM_ANIMATION_ENERGY_INTENSE, VRM_ANIMATION_ENERGY_MEDIUM, vrmAnimationSlots as vrmAnimationSlotNames } from '@proj-airi/stage-shared/vrm-animations'
import { useModelStore } from '@proj-airi/stage-ui-three'
import { Button, Callout, GhostButton, SelectTab } from '@proj-airi/ui'
import { useFileDialog } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useSettings } from '../../../../stores/settings'
import { useVrmAnimationsStore } from '../../../../stores/vrm-animations'
import { Container, PropertyColor, PropertyNumber, PropertyPoint } from '../../../data-pane'
import { ColorPalette } from '../../../widgets'

const props = withDefaults(defineProps<{
  palette: string[]
  allowExtractColors?: boolean
  runtimeSnapshot: ModelSettingsRuntimeSnapshot
}>(), {
  allowExtractColors: true,
})

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const { t } = useI18n()

const modelStore = useModelStore()
const {
  modelSize,
  maxFps,
  modelOffset,
  cameraFOV,
  modelRotationY,
  cameraDistance,
  trackingMode,

  directionalLightRotation,
  directionalLightIntensity,
  directionalLightColor,

  ambientLightIntensity,
  ambientLightColor,

  hemisphereLightIntensity,
  hemisphereSkyColor,
  hemisphereGroundColor,

  envSelect,
  skyBoxIntensity,
} = storeToRefs(modelStore)
const controlsLocked = computed(() => props.runtimeSnapshot.controlsLocked)

const airiCardStore = useAiriCardStore()
const settingsStore = useSettings()
const vrmAnimationsStore = useVrmAnimationsStore()
const { activeCard, activeCardId, selectedAvatarModel } = storeToRefs(airiCardStore)
const { stageModelSelected } = storeToRefs(settingsStore)
const { assets: vrmAnimationAssets, error: vrmAnimationError, loading: vrmAnimationLoading, supported: vrmAnimationsSupported } = storeToRefs(vrmAnimationsStore)
const vrmAnimationImportError = ref<string>()

const effectiveVrmAvatarModel = computed(() => {
  const selected = selectedAvatarModel.value
  if (selected?.type === 'vrm')
    return selected
  return activeCard.value?.extensions.airi.avatarModels.find(model =>
    model.type === 'vrm' && model.displayModelId === stageModelSelected.value,
  )
})

const vrmAnimationBindingModelId = computed(() =>
  stageModelSelected.value || effectiveVrmAvatarModel.value?.displayModelId,
)

const vrmAnimationBindings = computed<VrmAnimationBindings>(() => {
  const avatarModel = effectiveVrmAvatarModel.value
  const stored = avatarModel?.type === 'vrm' ? avatarModel.config.animations ?? {} : {}
  return vrmAnimationsStore.resolveBindings(vrmAnimationBindingModelId.value, stored)
})

const vrmSettingsTab = ref<'model' | 'animations'>('model')
const vrmSettingsTabOptions = computed<{ value: 'model' | 'animations', label: string, icon: string }[]>(() => [
  {
    value: 'model',
    label: t('settings.vrm.tabs.model'),
    icon: 'i-solar:settings-bold-duotone',
  },
  {
    value: 'animations',
    label: t('settings.vrm.tabs.animations'),
    icon: 'i-solar:play-bold-duotone',
  },
])

const vrmAnimationSlots = computed<{ slot: VrmAnimationSlot, label: string }[]>(() =>
  vrmAnimationSlotNames.map(slot => ({
    slot,
    label: t(`settings.vrm.animation.slots.${slot}`),
  })),
)

const vrmAnimationSelectOptions = computed(() => {
  const counts = new Map<string, number>()
  const options = vrmAnimationAssets.value.map((asset) => {
    const count = (counts.get(asset.name) ?? 0) + 1
    counts.set(asset.name, count)
    return {
      id: asset.id,
      label: count > 1 ? `${asset.name} (${count})` : asset.name,
    }
  })
  const knownIds = new Set(options.map(option => option.id))
  const missing = [...new Set(
    Object.values(vrmAnimationBindings.value).flatMap(clips => (clips ?? []).map(clip => clip.id)),
  )]
    .filter((id): id is string => !!id && !knownIds.has(id))
    .map(id => ({
      id,
      label: t('settings.vrm.animation.missing', { id }),
    }))
  return [...options, ...missing]
})

const vrmAnimationOptionLabels = computed(() =>
  new Map(vrmAnimationSelectOptions.value.map(option => [option.id, option.label])),
)

function vrmAnimationClips(slot: VrmAnimationSlot) {
  return vrmAnimationBindings.value[slot] ?? []
}

function vrmAnimationIds(slot: VrmAnimationSlot) {
  return vrmAnimationClips(slot).map(clip => clip.id)
}

function vrmAnimationLabel(id: string) {
  return vrmAnimationOptionLabels.value.get(id) ?? id
}

function vrmAnimationEnergy(slot: VrmAnimationSlot, id: string) {
  return vrmAnimationClips(slot).find(clip => clip.id === id)?.energy
}

function availableVrmAnimationOptions(slot: VrmAnimationSlot) {
  const selected = new Set(vrmAnimationIds(slot))
  return vrmAnimationSelectOptions.value.filter(option => !selected.has(option.id))
}

function onVrmAnimationAdd(slot: VrmAnimationSlot, event: Event) {
  const select = event.target as HTMLSelectElement
  const value = select.value
  // Reset immediately so adding the same option twice still fires a change.
  select.value = ''
  if (value)
    void addVrmAnimationBinding(slot, value)
}

const vrmAnimationDialog = useFileDialog({ accept: '.vrma', multiple: true, reset: true })
vrmAnimationDialog.onChange(async (files) => {
  if (!files)
    return

  vrmAnimationImportError.value = undefined
  for (const file of Array.from(files)) {
    try {
      await vrmAnimationsStore.importAnimation(file)
    }
    catch (error) {
      vrmAnimationImportError.value = errorMessageFrom(error)
    }
  }
})

function onVrmAnimationEnergyChange(slot: VrmAnimationSlot, id: string, event: Event) {
  const select = event.target as HTMLSelectElement
  void setVrmAnimationEnergy(slot, id, select.value === '' ? undefined : Number(select.value))
}

async function addVrmAnimationBinding(slot: VrmAnimationSlot, id: string) {
  const current = vrmAnimationClips(slot)
  if (current.some(clip => clip.id === id))
    return
  await setVrmAnimationBindings(slot, [...current, { id }])
}

async function removeVrmAnimationBinding(slot: VrmAnimationSlot, id: string) {
  await setVrmAnimationBindings(slot, vrmAnimationClips(slot).filter(clip => clip.id !== id))
}

async function setVrmAnimationEnergy(slot: VrmAnimationSlot, id: string, energy: number | undefined) {
  const clips = vrmAnimationClips(slot).map((clip) => {
    if (clip.id !== id)
      return clip
    if (energy === undefined) {
      const next = { ...clip }
      delete next.energy
      return next
    }
    return { ...clip, energy }
  })
  await setVrmAnimationBindings(slot, clips)
}

async function clearVrmAnimationBinding(slot: VrmAnimationSlot) {
  await setVrmAnimationBindings(slot, [])
}

async function setVrmAnimationBindings(slot: VrmAnimationSlot, clips: VrmAnimationClipBinding[]) {
  const modelId = vrmAnimationBindingModelId.value
  if (!modelId) {
    vrmAnimationImportError.value = t('settings.vrm.animation.bind-error')
    return
  }

  const animations = { ...vrmAnimationBindings.value }
  const normalized = clips.filter((clip, index, all) =>
    !!clip.id && all.findIndex(candidate => candidate.id === clip.id) === index,
  )
  if (normalized.length > 0)
    animations[slot] = normalized
  else
    delete animations[slot]

  // The shared store is the source of truth for both windows. The card copy is
  // best effort because the Models page can show a stage VRM that the active
  // character has not linked yet.
  vrmAnimationsStore.setBindings(modelId, animations)
  vrmAnimationImportError.value = undefined

  if (stageModelSelected.value) {
    const selected = selectedAvatarModel.value
    if (!selected || selected.type !== 'vrm' || selected.displayModelId !== stageModelSelected.value)
      await airiCardStore.setActiveCardDefaultAvatarModel(stageModelSelected.value)
  }

  const avatarModel = selectedAvatarModel.value
  if (avatarModel?.type === 'vrm' && avatarModel.displayModelId === modelId)
    await airiCardStore.updateVrmAnimationBindings(activeCardId.value, avatarModel.id, animations)
}

async function openVrmAnimationFolder() {
  try {
    await vrmAnimationsStore.reveal()
  }
  catch (error) {
    vrmAnimationImportError.value = errorMessageFrom(error)
  }
}

function formatAnimationSize(bytes: number) {
  if (bytes >= 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function previewVrmAnimation(asset: VrmAnimationAsset) {
  vrmAnimationImportError.value = undefined
  window.dispatchEvent(new CustomEvent('airi:vrm-animation-preview', {
    detail: { assetId: asset.id },
  }))
}

function stopPreviewVrmAnimation() {
  window.dispatchEvent(new CustomEvent('airi:vrm-animation-preview-stop'))
}

async function deleteVrmAnimation(asset: VrmAnimationAsset) {
  vrmAnimationImportError.value = undefined
  try {
    await vrmAnimationsStore.removeAnimation(asset.id)
    airiCardStore.removeVrmAnimationAsset(asset.id)
  }
  catch (error) {
    vrmAnimationImportError.value = errorMessageFrom(error)
  }
}

onMounted(() => {
  void vrmAnimationsStore.refresh()
})
// Bare numbers and an i18n'd unlimited label, matching the Live2D and Spine frame-rate controls.
const fpsOptions = computed(() => [
  { value: 0, label: t('settings.vrm.fps.options.unlimited') },
  { value: 60, label: '60' },
  { value: 30, label: '30' },
])
const canExtractColors = computed(() => props.runtimeSnapshot.canCapturePreview)
const trackingOptions = computed<{
  value: 'camera' | 'mouse' | 'none'
  label: string
  class: string
}[]>(() => [
  { value: 'camera', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.camera'), class: 'col-start-3' },
  { value: 'mouse', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.mouse'), class: 'col-start-4' },
  { value: 'none', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.disabled'), class: 'col-start-5' },
])

// switch between hemisphere light and sky box
const settingsLockClass = computed(() => {
  return controlsLocked.value ? ['pointer-events-none', 'opacity-60'] : []
})

const envOptions = computed(() => [
  {
    value: 'hemisphere',
    label: 'Hemisphere',
    icon: envSelect.value === 'hemisphere'
      ? 'i-solar:forbidden-circle-bold rotate-45'
      : 'i-solar:forbidden-circle-linear rotate-45',
  },
  {
    value: 'skyBox',
    label: 'SkyBox',
    icon: envSelect.value === 'skyBox'
      ? 'i-solar:gallery-circle-bold'
      : 'i-solar:gallery-circle-linear',
  },
])
</script>

<template>
  <SelectTab
    v-model="vrmSettingsTab"
    :options="vrmSettingsTabOptions"
    size="sm"
    :class="['mb-2']"
  />
  <template v-if="vrmSettingsTab === 'model'">
    <Container :title="t('settings.vrm.fps.title')" icon="i-solar:speedometer-bold-duotone">
      <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.vrm.fps.description') }}
      </p>
      <SelectTab v-model="maxFps" :options="fpsOptions" size="sm" :class="['shrink-0']" />
    </Container>
  </template>
  <template v-if="vrmSettingsTab === 'animations'">
    <Container
      :title="t('settings.vrm.animation.title')"
      icon="i-solar:play-bold-duotone"
      :class="[
        'rounded-xl',
        'bg-white/80  dark:bg-black/75',
        'backdrop-blur-lg',
      ]"
    >
      <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.vrm.animation.description') }}
      </p>
      <Callout v-if="!vrmAnimationsSupported" :label="t('settings.vrm.animation.title')">
        <div :class="['text-sm', 'text-neutral-600 dark:text-neutral-400']">
          {{ t('settings.vrm.animation.desktop-only') }}
        </div>
      </Callout>
      <template v-else>
        <div :class="['mt-2', 'flex', 'flex-wrap', 'items-center', 'gap-2']">
          <Button @click="vrmAnimationDialog.open()">
            {{ t('settings.vrm.animation.import') }}
          </Button>
          <GhostButton size="sm" @click="openVrmAnimationFolder()">
            {{ t('settings.vrm.animation.open-folder') }}
          </GhostButton>
          <GhostButton size="sm" :disabled="vrmAnimationLoading" @click="vrmAnimationsStore.refresh()">
            {{ t('settings.vrm.animation.refresh') }}
          </GhostButton>
        </div>
        <p v-if="vrmAnimationImportError || vrmAnimationError" :class="['mt-2', 'text-xs', 'text-red-500']">
          {{ vrmAnimationImportError || vrmAnimationError }}
        </p>
        <div v-if="vrmAnimationAssets.length > 0" :class="['mt-3', 'flex', 'flex-col', 'gap-1']">
          <div :class="['text-xs', 'font-medium', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ t('settings.vrm.animation.library') }}
          </div>
          <div
            v-for="asset in vrmAnimationAssets"
            :key="asset.id"
            :class="[
              'flex',
              'cursor-pointer',
              'items-center',
              'gap-3',
              'rounded-lg',
              'border',
              'border-neutral-200',
              'px-3',
              'py-2',
              'hover:bg-neutral-50',
              'dark:border-neutral-800',
              'dark:hover:bg-neutral-800/50',
            ]"
          >
            <div :class="['min-w-0', 'flex-1']">
              <div :class="['truncate', 'text-sm']">
                {{ asset.name }}
              </div>
              <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                {{ formatAnimationSize(asset.size) }}
              </div>
            </div>
            <button
              type="button"
              :title="t('settings.vrm.animation.preview')"
              :aria-label="`${t('settings.vrm.animation.preview')} ${asset.name}`"
              :class="[
                'shrink-0',
                'rounded-lg',
                'border',
                'border-neutral-200',
                'px-2',
                'py-1',
                'text-xs',
                'text-primary-500',
                'hover:bg-neutral-100',
                'dark:border-neutral-700',
                'dark:hover:bg-neutral-800',
              ]"
              @click.stop.prevent="previewVrmAnimation(asset)"
            >
              {{ t('settings.vrm.animation.preview') }}
            </button>
            <button
              type="button"
              :title="t('settings.vrm.animation.stop')"
              :aria-label="t('settings.vrm.animation.stop')"
              :class="[
                'shrink-0',
                'rounded-lg',
                'border',
                'border-neutral-200',
                'px-2',
                'py-1',
                'text-xs',
                'text-neutral-600',
                'hover:bg-neutral-100',
                'dark:border-neutral-700',
                'dark:text-neutral-300',
                'dark:hover:bg-neutral-800',
              ]"
              @click.stop.prevent="stopPreviewVrmAnimation"
            >
              {{ t('settings.vrm.animation.stop') }}
            </button>
            <button
              type="button"
              :title="t('settings.vrm.animation.delete')"
              :aria-label="`${t('settings.vrm.animation.delete')} ${asset.name}`"
              :class="[
                'shrink-0',
                'rounded-lg',
                'border',
                'border-neutral-200',
                'px-2',
                'py-1',
                'text-xs',
                'text-red-500',
                'hover:bg-neutral-100',
                'dark:border-neutral-700',
                'dark:hover:bg-neutral-800',
              ]"
              @click.stop.prevent="deleteVrmAnimation(asset)"
            >
              {{ t('settings.vrm.animation.delete') }}
            </button>
          </div>
        </div>
        <p v-if="vrmAnimationAssets.length === 0" :class="['mt-2', 'text-xs', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.vrm.animation.empty') }}
        </p>
        <div v-else :class="['mt-3', 'flex', 'flex-col', 'gap-2']">
          <div
            v-for="slot in vrmAnimationSlots"
            :key="slot.slot"
            :class="['flex', 'flex-col', 'gap-2']"
          >
            <div :class="['flex', 'items-center', 'gap-1']">
              <span :class="['text-sm', 'font-medium']">{{ slot.label }}</span>
              <button
                v-if="vrmAnimationIds(slot.slot).length > 0"
                type="button"
                :title="t('settings.vrm.animation.clear')"
                :aria-label="t('settings.vrm.animation.clear')"
                :class="['ml-1', 'text-xs', 'text-primary-500', 'underline']"
                @click.stop.prevent="clearVrmAnimationBinding(slot.slot)"
              >
                {{ t('settings.vrm.animation.clear') }}
              </button>
            </div>
            <div
              v-if="vrmAnimationIds(slot.slot).length > 0"
              :class="['flex', 'flex-wrap', 'items-center', 'gap-1.5']"
            >
              <span
                v-for="clip in vrmAnimationClips(slot.slot)"
                :key="clip.id"
                :class="[
                  'inline-flex',
                  'max-w-full',
                  'items-center',
                  'gap-1',
                  'rounded-full',
                  'border-2',
                  'border-neutral-200',
                  'bg-neutral-50',
                  'py-1',
                  'pl-2.5',
                  'pr-1',
                  'text-xs',
                  'text-neutral-700',
                  'dark:border-neutral-800',
                  'dark:bg-neutral-900',
                  'dark:text-neutral-200',
                ]"
              >
                <span :class="['min-w-0', 'truncate']">{{ vrmAnimationLabel(clip.id) }}</span>
                <select
                  v-if="slot.slot === 'dance'"
                  :value="vrmAnimationEnergy(slot.slot, clip.id)?.toString() ?? ''"
                  :aria-label="t('settings.vrm.animation.energy')"
                  :class="[
                    'h-6',
                    'shrink-0',
                    'rounded-md',
                    'border',
                    'border-neutral-300',
                    'bg-white',
                    'px-1',
                    'text-xs',
                    'text-neutral-600',
                    'outline-none',
                    'dark:border-neutral-700',
                    'dark:bg-neutral-800',
                    'dark:text-neutral-300',
                  ]"
                  @change="onVrmAnimationEnergyChange(slot.slot, clip.id, $event)"
                >
                  <option value="">{{ t('settings.vrm.animation.energy-auto') }}</option>
                  <option :value="VRM_ANIMATION_ENERGY_CALM">{{ t('settings.vrm.animation.energy-low') }}</option>
                  <option :value="VRM_ANIMATION_ENERGY_MEDIUM">{{ t('settings.vrm.animation.energy-medium') }}</option>
                  <option :value="VRM_ANIMATION_ENERGY_INTENSE">{{ t('settings.vrm.animation.energy-high') }}</option>
                </select>
                <button
                  type="button"
                  :title="t('settings.vrm.animation.remove')"
                  :aria-label="t('settings.vrm.animation.remove')"
                  :class="[
                    'flex',
                    'size-4',
                    'shrink-0',
                    'items-center',
                    'justify-center',
                    'rounded-full',
                    'text-neutral-500',
                    'hover:bg-neutral-200',
                    'hover:text-neutral-800',
                    'dark:text-neutral-400',
                    'dark:hover:bg-neutral-700',
                    'dark:hover:text-neutral-100',
                  ]"
                  @click.stop.prevent="removeVrmAnimationBinding(slot.slot, clip.id)"
                >
                  ×
                </button>
              </span>
            </div>
            <p v-else :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
              {{ slot.slot === 'idle' ? t('settings.vrm.animation.default-idle') : t('settings.vrm.animation.none') }}
            </p>
            <select
              value=""
              :class="[
                'h-9',
                'w-full',
                'rounded-xl',
                'border-2',
                'border-neutral-200',
                'bg-white',
                'px-3',
                'text-sm',
                'text-neutral-700',
                'outline-none',
                'dark:border-neutral-800',
                'dark:bg-neutral-900',
                'dark:text-neutral-200',
              ]"
              @change="onVrmAnimationAdd(slot.slot, $event)"
            >
              <option value="">
                {{ vrmAnimationIds(slot.slot).length > 0 ? t('settings.vrm.animation.add-more') : t('settings.vrm.animation.add') }}
              </option>
              <option
                v-for="option in availableVrmAnimationOptions(slot.slot)"
                :key="option.id"
                :value="option.id"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>
      </template>
    </Container>
  </template>
  <template v-if="vrmSettingsTab === 'model'">
    <Container
      :title="t('settings.pages.models.sections.section.scene')"
      icon="i-solar:people-nearby-bold-duotone"
      :class="[
        'rounded-xl',
        'bg-white/80  dark:bg-black/75',
        'backdrop-blur-lg',
      ]"
    >
      <template v-if="allowExtractColors">
        <ColorPalette class="mb-4 mt-2" :colors="palette.map(hex => ({ hex, name: hex }))" mx-auto />
        <Button :disabled="controlsLocked || !canExtractColors" @click="$emit('extractColorsFromModel')">
          {{ t('settings.vrm.theme-color-from-model.button-extract.title') }}
        </Button>
      </template>

      <div grid="~ cols-5 gap-1" p-2 :class="settingsLockClass">
        <PropertyPoint
          v-model:x="modelOffset.x"
          v-model:y="modelOffset.y"
          v-model:z="modelOffset.z"
          :disabled="controlsLocked"
          label="Model Position"
          :x-config="{ min: -modelSize.x * 2, max: modelSize.x * 2, step: modelSize.x / 10000, label: 'X', formatValue: val => val?.toFixed(4) }"
          :y-config="{ min: -modelSize.y * 2, max: modelSize.y * 2, step: modelSize.y / 10000, label: 'Y', formatValue: val => val?.toFixed(4) }"
          :z-config="{ min: -modelSize.z * 2, max: modelSize.z * 2, step: modelSize.z / 10000, label: 'Z', formatValue: val => val?.toFixed(4) }"
        />
        <PropertyNumber
          v-model="cameraFOV"
          :config="{ min: 1, max: 180, step: 1, label: t('settings.vrm.scale-and-position.fov'), disabled: controlsLocked }"
          :label="t('settings.vrm.scale-and-position.fov')"
        />
        <PropertyNumber
          v-model="cameraDistance"
          :config="{ min: modelSize.z, max: modelSize.z * 20, step: modelSize.z / 100, label: t('settings.vrm.scale-and-position.camera-distance'), formatValue: val => val?.toFixed(4), disabled: controlsLocked }"
          :label="t('settings.vrm.scale-and-position.camera-distance')"
        />
        <PropertyNumber
          v-model="modelRotationY"
          :config="{ min: -180, max: 180, step: 1, label: t('settings.vrm.scale-and-position.rotation-y'), disabled: controlsLocked }"
          :label="t('settings.vrm.scale-and-position.rotation-y')"
        />

        <!-- Set eye tracking mode -->
        <div class="text-xs">
          {{ t('settings.vrm.scale-and-position.eye-tracking-mode.title') }}:
        </div>
        <div />
        <template v-for="option in trackingOptions" :key="option.value">
          <GhostButton
            :class="[option.class, 'w-auto']"
            :disabled="controlsLocked"
            size="sm"
            :active="trackingMode === option.value"
            :label="option.label"
            @click="trackingMode = option.value"
          />
        </template>

        <PropertyNumber
          v-model="directionalLightRotation.x"
          :config="{ min: -180, max: 180, step: 1, label: 'RotationXDeg', formatValue: val => val?.toFixed(0), disabled: controlsLocked }"
          label="Directional Light Rotation - X"
        />
        <PropertyNumber
          v-model="directionalLightRotation.y"
          :config="{ min: -180, max: 180, step: 1, label: 'RotationYDeg', formatValue: val => val?.toFixed(0), disabled: controlsLocked }"
          label="Directional Light Rotation - Y"
        />
        <PropertyColor
          v-model="directionalLightColor"
          :disabled="controlsLocked"
          label="Directional Light Color"
        />

        <PropertyNumber
          v-model="directionalLightIntensity"
          :config="{ min: 0, max: 10, step: 0.01, label: 'Intensity', disabled: controlsLocked }"
          label="Directional Light Intensity"
        />

        <PropertyNumber
          v-model="ambientLightIntensity"
          :config="{ min: 0, max: 10, step: 0.01, label: 'Intensity', disabled: controlsLocked }"
          label="Ambient Light Intensity"
        />
        <PropertyColor
          v-model="ambientLightColor"
          :disabled="controlsLocked"
          label="Ambient Light Color"
        />
      </div>
      <div>
        <div
          :class="[
            'px-2',
            'pt-2',
            'text-xs',
            'text-neutral-500',
            'dark:text-neutral-400',
          ]"
        >
          Environment
        </div>
        <div :class="['p-2', ...settingsLockClass]">
          <SelectTab v-model="envSelect" :options="envOptions" :disabled="controlsLocked" size="sm" />
        </div>
        <div v-if="envSelect === 'hemisphere'">
          <!-- hemisphere settings -->
          <div grid="~ cols-5 gap-1" p-2 :class="settingsLockClass">
            <PropertyNumber
              v-model="hemisphereLightIntensity"
              :config="{ min: 0, max: 10, step: 0.01, label: 'Intensity', disabled: controlsLocked }"
              label="Hemisphere Light Intensity"
            />
            <PropertyColor
              v-model="hemisphereSkyColor"
              :disabled="controlsLocked"
              label="Hemisphere Sky Color"
            />
            <PropertyColor
              v-model="hemisphereGroundColor"
              :disabled="controlsLocked"
              label="Hemisphere Ground Color"
            />
          </div>
        </div>
        <div v-else>
          <!-- skybox settings -->
          <div grid="~ cols-5 gap-1" p-2 :class="settingsLockClass">
            <PropertyNumber
              v-model="skyBoxIntensity"
              :config="{ min: 0, max: 1, step: 0.01, label: 'Intensity', disabled: controlsLocked }"
              :label="t('settings.vrm.skybox.skybox-intensity')"
            />
          </div>
        </div>
      </div>
    </Container>
    <Container
      :title="t('settings.vrm.change-model.title')"
      icon="i-solar:magic-stick-3-bold-duotone"
      inner-class="text-sm"
      :class="[
        'rounded-xl',
        'bg-white/80  dark:bg-black/75',
        'backdrop-blur-lg',
      ]"
    >
      <Callout :label="t('settings.vrm.scale-and-position.model-info-title')">
        <div>
          <div class="text-sm text-neutral-600 space-y-1 dark:text-neutral-400">
            <div class="flex justify-between">
              <span>{{ t('settings.vrm.scale-and-position.model-info-x') }}</span>
              <span>{{ modelSize.x.toFixed(4) }}</span>
            </div>
            <div class="flex justify-between">
              <span>{{ t('settings.vrm.scale-and-position.model-info-y') }}</span>
              <span>{{ modelSize.y.toFixed(4) }}</span>
            </div>
            <div class="flex justify-between">
              <span>{{ t('settings.vrm.scale-and-position.model-info-z') }}</span>
              <span>{{ modelSize.z.toFixed(4) }}</span>
            </div>
          </div>
        </div>
      </Callout>
      <Callout
        theme="lime"
        label="Tips!"
      >
        <div class="text-sm text-neutral-600 space-y-1 dark:text-neutral-400">
          {{ t('settings.vrm.scale-and-position.tips') }}
        </div>
      </Callout>
    </Container>
  </template>
</template>
