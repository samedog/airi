<script setup lang="ts">
import type { VrmMeshCategory, VrmMeshNode } from '@proj-airi/stage-ui-three'

import { useEventListener, useWindowSize } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  open: boolean
  x: number
  y: number
  nodes: VrmMeshNode[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggle', node: VrmMeshNode): void
  (e: 'reset'): void
}>()

const { t } = useI18n()

interface CategoryMeta {
  id: VrmMeshCategory
  icon: string
}

interface CategoryGroup extends CategoryMeta {
  label: string
  nodes: VrmMeshNode[]
}

const CATEGORY_META: readonly CategoryMeta[] = [
  { id: 'body', icon: 'i-solar:body-bold-duotone' },
  { id: 'outfit', icon: 'i-solar:t-shirt-bold-duotone' },
  { id: 'accessories', icon: 'i-solar:bag-2-bold-duotone' },
  { id: 'extras', icon: 'i-solar:box-bold-duotone' },
]

const activeCategory = ref<VrmMeshCategory>()
const categoryGroups = computed<CategoryGroup[]>(() => CATEGORY_META.map(meta => ({
  ...meta,
  label: t(`settings.vrm.model-parts.categories.${meta.id}`),
  nodes: props.nodes.filter(node => node.category === meta.id),
})))
const activeGroup = computed(() => categoryGroups.value.find(group => group.id === activeCategory.value))
const displayedNodes = computed(() => activeGroup.value?.nodes ?? [])
const displayedCount = computed(() => activeCategory.value ? displayedNodes.value.length : categoryGroups.value.length)

const { width, height } = useWindowSize()
const itemRadius = computed(() => {
  if (!activeCategory.value)
    return 112
  const count = Math.max(displayedNodes.value.length, 1)
  return Math.min(190, Math.max(136, 96 + count * 6))
})
const safeInset = computed(() => itemRadius.value + 64)
const center = computed(() => ({
  x: Math.min(Math.max(props.x, safeInset.value), Math.max(safeInset.value, width.value - safeInset.value)),
  y: Math.min(Math.max(props.y, safeInset.value), Math.max(safeInset.value, height.value - safeInset.value)),
}))
const title = computed(() => activeGroup.value?.label ?? t('settings.vrm.model-parts.title'))
const subtitle = computed(() => activeCategory.value
  ? t('settings.vrm.model-parts.choose-part')
  : t('settings.vrm.model-parts.choose-category'))

watch(() => props.open, (open) => {
  if (open)
    activeCategory.value = undefined
}, { immediate: true })

function itemStyle(index: number) {
  const count = Math.max(displayedCount.value, 1)
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count
  return {
    left: '50%',
    top: '50%',
    transform: `translate(-50%, -50%) translate(${Math.cos(angle) * itemRadius.value}px, ${Math.sin(angle) * itemRadius.value}px)`,
  }
}

function selectCategory(group: CategoryGroup) {
  if (group.nodes.length > 0)
    activeCategory.value = group.id
}

function back() {
  activeCategory.value = undefined
}

function meshLabel(name: string) {
  return name
    .replace(/\.\d+$/, '')
    .replace(/^BaseMesh_/, '')
    .replaceAll('_', ' ')
}

function onKeydown(event: KeyboardEvent) {
  if (!props.open || event.key !== 'Escape')
    return
  event.preventDefault()
  if (activeCategory.value)
    back()
  else
    emit('close')
}

useEventListener(window, 'keydown', onKeydown)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-100 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @click.self="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <button
        type="button"
        class="absolute inset-0 cursor-default bg-neutral-950/20 backdrop-blur-[2px]"
        :aria-label="t('settings.vrm.model-parts.close')"
        @click="emit('close')"
      />

      <button
        v-if="activeCategory"
        type="button"
        class="absolute left-4 top-4 z-10 size-9 flex items-center justify-center rounded-full bg-white/90 text-neutral-600 shadow-lg dark:bg-neutral-800/90 hover:bg-white dark:text-neutral-300"
        :title="t('settings.vrm.model-parts.back')"
        :aria-label="t('settings.vrm.model-parts.back')"
        @click.stop="back"
      >
        <span class="i-solar:alt-arrow-left-bold-duotone text-lg" aria-hidden="true" />
      </button>

      <div
        class="pointer-events-none absolute inset-x-0 top-4 z-10 flex flex-col items-center gap-1 px-16 text-center"
      >
        <div class="text-xs text-white/90 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {{ title }}
        </div>
        <div class="text-[10px] text-white/65 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {{ subtitle }}
        </div>
      </div>

      <div class="absolute right-4 top-4 z-10 flex items-center gap-2">
        <button
          v-if="activeCategory"
          type="button"
          class="size-9 flex items-center justify-center rounded-full bg-white/90 text-neutral-600 shadow-lg dark:bg-neutral-800/90 hover:bg-white dark:text-neutral-300"
          :title="t('settings.vrm.model-parts.reset-all')"
          :aria-label="t('settings.vrm.model-parts.reset-all')"
          @click.stop="emit('reset')"
        >
          <span class="i-solar:refresh-bold-duotone text-base" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="size-8 flex items-center justify-center rounded-full bg-white/90 text-lg text-neutral-600 shadow-lg dark:bg-neutral-800/90 hover:bg-white dark:text-neutral-300"
          :aria-label="t('settings.vrm.model-parts.close')"
          @click="emit('close')"
        >
          ×
        </button>
      </div>

      <div
        class="pointer-events-none absolute border border-white/30 rounded-full border-dashed"
        :style="{
          left: `${center.x}px`,
          top: `${center.y}px`,
          width: `${itemRadius * 2}px`,
          height: `${itemRadius * 2}px`,
          transform: 'translate(-50%, -50%)',
        }"
      />

      <div
        class="absolute"
        :style="{ left: `${center.x}px`, top: `${center.y}px` }"
      >
        <button
          type="button"
          class="absolute left-1/2 top-1/2 size-16 flex flex-col items-center justify-center gap-0.5 border-2 border-white/70 rounded-full bg-white/90 px-2 text-center text-[10px] text-neutral-700 font-semibold leading-tight shadow-xl -translate-x-1/2 -translate-y-1/2 dark:border-neutral-600 dark:bg-neutral-800/95 hover:bg-white dark:text-neutral-200"
          @click.stop="activeCategory ? back() : emit('reset')"
        >
          <span
            v-if="activeCategory"
            class="i-solar:alt-arrow-left-bold-duotone text-base"
            aria-hidden="true"
          />
          {{ activeCategory ? t('settings.vrm.model-parts.back') : t('settings.vrm.model-parts.reset') }}
        </button>

        <template v-if="!activeCategory">
          <button
            v-for="(group, index) in categoryGroups"
            :key="group.id"
            type="button"
            :style="itemStyle(index)"
            :disabled="group.nodes.length === 0"
            :title="group.nodes.length === 0 ? t('settings.vrm.model-parts.empty-category') : group.label"
            class="absolute w-28 flex items-center gap-1.5 border-2 rounded-2xl px-2 py-2 text-left text-[10px] font-medium shadow-lg transition"
            :class="group.nodes.length === 0
              ? 'cursor-not-allowed border-neutral-300/50 bg-neutral-200/70 text-neutral-400 opacity-60 dark:border-neutral-700/60 dark:bg-neutral-900/70 dark:text-neutral-500'
              : 'border-primary-300/80 bg-white/95 text-neutral-700 shadow-primary-900/10 dark:border-primary-500/70 dark:bg-neutral-800/95 dark:text-neutral-100 hover:bg-white dark:hover:bg-neutral-800'"
            @click.stop="selectCategory(group)"
          >
            <span :class="group.icon" class="shrink-0 text-base" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ group.label }}</span>
            <span
              class="absolute h-4 min-w-4 flex items-center justify-center border border-white/70 rounded-full px-1 text-[9px] text-white font-bold -right-1.5 -top-1.5 dark:border-neutral-800"
              :class="group.nodes.length === 0 ? 'bg-neutral-400 dark:bg-neutral-600' : 'bg-primary-500'"
            >
              {{ group.nodes.length }}
            </span>
          </button>
        </template>

        <template v-else>
          <button
            v-for="(node, index) in displayedNodes"
            :key="node.id"
            type="button"
            :style="itemStyle(index)"
            :title="node.name"
            :aria-pressed="node.visible"
            class="absolute w-20 flex flex-col items-center gap-1 border-2 rounded-xl px-1.5 py-1 text-center text-[10px] leading-tight shadow-lg"
            :class="node.visible
              ? 'border-primary-300/80 bg-white/95 text-neutral-700 dark:border-primary-500/70 dark:bg-neutral-800/95 dark:text-neutral-100'
              : 'border-neutral-300/80 bg-neutral-200/90 text-neutral-500 opacity-70 dark:border-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-400'"
            @click.stop="emit('toggle', node)"
          >
            <span
              :class="node.visible
                ? 'i-solar:eye-bold-duotone text-base text-primary-500'
                : 'i-solar:eye-closed-bold-duotone text-base'"
              aria-hidden="true"
            />
            <span class="w-full truncate">{{ meshLabel(node.name) }}</span>
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>
