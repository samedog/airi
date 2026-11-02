<script setup lang="ts">
import type { VrmMeshNode } from '@proj-airi/stage-ui-three'

import { useEventListener, useWindowSize } from '@vueuse/core'
import { computed } from 'vue'

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

const { width, height } = useWindowSize()
const radius = computed(() => Math.min(154, Math.max(120, Math.min(width.value, height.value) * 0.25)))
const safeInset = computed(() => radius.value + 48)

const center = computed(() => ({
  x: Math.min(Math.max(props.x, safeInset.value), Math.max(safeInset.value, width.value - safeInset.value)),
  y: Math.min(Math.max(props.y, safeInset.value), Math.max(safeInset.value, height.value - safeInset.value)),
}))

function itemStyle(index: number) {
  const count = Math.max(props.nodes.length, 1)
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count
  return {
    left: '50%',
    top: '50%',
    transform: `translate(-50%, -50%) translate(${Math.cos(angle) * radius.value}px, ${Math.sin(angle) * radius.value}px)`,
  }
}

function meshLabel(name: string) {
  return name
    .replace(/\.\d+$/, '')
    .replace(/^BaseMesh_/, '')
    .replaceAll('_', ' ')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
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
      aria-label="Model parts"
      @click.self="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <button
        type="button"
        class="absolute inset-0 cursor-default bg-neutral-950/20 backdrop-blur-[2px]"
        aria-label="Close model parts"
        @click="emit('close')"
      />

      <div
        class="pointer-events-none absolute inset-x-0 top-4 text-center text-xs text-white/90 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
      >
        Model parts
      </div>

      <button
        type="button"
        class="absolute right-4 top-4 size-8 flex items-center justify-center rounded-full bg-white/90 text-lg text-neutral-600 shadow-lg dark:bg-neutral-800/90 hover:bg-white dark:text-neutral-300"
        aria-label="Close model parts"
        @click="emit('close')"
      >
        ×
      </button>

      <div
        class="pointer-events-none absolute border border-white/30 rounded-full border-dashed"
        :style="{
          left: `${center.x}px`,
          top: `${center.y}px`,
          width: `${radius * 2}px`,
          height: `${radius * 2}px`,
          transform: 'translate(-50%, -50%)',
        }"
      />

      <div
        class="absolute"
        :style="{ left: `${center.x}px`, top: `${center.y}px` }"
      >
        <button
          type="button"
          class="absolute left-1/2 top-1/2 size-16 flex items-center justify-center border-2 border-white/70 rounded-full bg-white/90 px-2 text-center text-xs text-neutral-700 font-semibold shadow-xl -translate-x-1/2 -translate-y-1/2 dark:border-neutral-600 dark:bg-neutral-800/95 hover:bg-white dark:text-neutral-200"
          @click.stop="emit('reset')"
        >
          Reset
        </button>

        <button
          v-for="(node, index) in nodes"
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
      </div>
    </div>
  </Teleport>
</template>
