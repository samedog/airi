<script setup lang="ts">
import type { BeatSyncAudioSource, BeatSyncDetectorState, BeatSyncVibe } from '@proj-airi/stage-shared/beat-sync'

import { errorMessageFrom } from '@moeru/std'
import {
  getBeatSyncState,
  listBeatSyncAudioSources,
  listenBeatSyncStateChange,
  listenBeatSyncVibeSignal,
  MAX_BEAT_SYNC_VIBE_ENERGY_GAIN,
  MIN_BEAT_SYNC_VIBE_ENERGY_GAIN,
  toggleBeatSync,
  updateBeatSyncVibeParameters,
} from '@proj-airi/stage-shared/beat-sync'
import { Alert } from '@proj-airi/stage-ui/components'
import { MAX_BEAT_SYNC_HIT_WINDOW, MIN_BEAT_SYNC_HIT_WINDOW } from '@proj-airi/stage-ui/constants/beat-sync-pulse'
import { useSettingsBeatSync } from '@proj-airi/stage-ui/stores/settings'
import { Button, FieldRange, FieldSelect, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const state = ref<BeatSyncDetectorState>()
const beatSyncSettings = useSettingsBeatSync()
const { audioSourceId, vibeEnergyGain, dancePulseHits } = storeToRefs(beatSyncSettings)
const audioSources = ref<BeatSyncAudioSource[]>([])
const isLoadingAudioSources = ref(false)
const starting = ref(false)
const audioSourceError = ref<string>()
const startError = ref<string>()
const vibe = ref<BeatSyncVibe>({ energy: 0, punch: 0, hit: 0 })
const energyPercent = computed(() => Math.round(vibe.value.energy * 100))
const punchPercent = computed(() => Math.round(vibe.value.punch * 100))
const hitPercent = computed(() => Math.round(vibe.value.hit * 100))
const audioSourceOptions = computed(() => audioSources.value.map(source => ({
  label: source.label,
  value: source.id,
  description: source.description,
})))

const { t } = useI18n()

watch([state, vibeEnergyGain], ([newState, newEnergyGain]) => {
  if (newState?.isActive)
    updateBeatSyncVibeParameters({ energyGain: newEnergyGain })
}, { deep: true, immediate: true })

async function loadAudioSources() {
  isLoadingAudioSources.value = true
  audioSourceError.value = undefined

  try {
    const sources = await listBeatSyncAudioSources()
    audioSources.value = sources

    if (audioSourceId.value && !sources.some(source => source.id === audioSourceId.value))
      audioSourceId.value = ''
  }
  catch (error) {
    audioSources.value = []
    audioSourceError.value = errorMessageFrom(error) ?? 'Unable to list audio sources'
  }
  finally {
    isLoadingAudioSources.value = false
  }
}

async function startBeatSync() {
  startError.value = undefined
  if (!audioSourceId.value || state.value?.isActive || starting.value)
    return

  starting.value = true
  try {
    await toggleBeatSync(true, audioSourceId.value)
  }
  catch (error) {
    startError.value = errorMessageFrom(error) ?? 'Failed to start Beat Sync'
  }
  finally {
    starting.value = false
  }
}

async function stopBeatSync() {
  startError.value = undefined

  try {
    await toggleBeatSync(false)
  }
  catch (error) {
    startError.value = errorMessageFrom(error) ?? 'Failed to stop Beat Sync'
  }
}

watch(audioSourceId, (next, previous) => {
  if (next !== previous && state.value?.isActive)
    void stopBeatSync()
})

onMounted(() => {
  void loadAudioSources()
  getBeatSyncState()
    .then(initialState => state.value = initialState)
    .catch(error => startError.value = errorMessageFrom(error) ?? 'Could not read Beat Sync state')

  const removeHandlerFns = [
    listenBeatSyncStateChange((newState) => {
      state.value = { ...newState }
      if (newState.isActive) {
        // A start can finish after the request timeout. The state event is the
        // source of truth, so clear the stale timeout error when it arrives.
        starting.value = false
        startError.value = undefined
      }
      else {
        vibe.value = { energy: 0, punch: 0, hit: 0 }
      }
    }),
    listenBeatSyncVibeSignal((next) => {
      vibe.value = next
    }),
  ]

  const removeHandlers = () => removeHandlerFns.forEach(fn => fn())
  onUnmounted(() => removeHandlers())
})
</script>

<template>
  <div flex="~ col md:row gap-6">
    <SettingsCard class="md:w-[60%]">
      <div flex="~ col gap-6">
        <div flex="~ col gap-4">
          <div>
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
              {{ t('settings.pages.modules.beat_sync.sections.audio_source.title') }}
            </h2>
            <div text="neutral-400 dark:neutral-400">
              <span>{{ t('settings.pages.modules.beat_sync.sections.audio_source.description') }}</span>
            </div>
          </div>

          <FieldSelect
            v-model="audioSourceId"
            :label="t('settings.pages.modules.beat_sync.sections.audio_source.source.label')"
            :description="t('settings.pages.modules.beat_sync.sections.audio_source.source.description')"
            :placeholder="t('settings.pages.modules.beat_sync.sections.audio_source.source.placeholder')"
            :options="audioSourceOptions"
            :disabled="state?.isActive || isLoadingAudioSources || starting"
          />

          <div max-w-full flex="~ row gap-4 wrap">
            <Button
              variant="secondary"
              :disabled="isLoadingAudioSources"
              @click="loadAudioSources"
            >
              {{ t('settings.pages.modules.beat_sync.sections.audio_source.actions.refresh') }}
            </Button>

            <template v-if="state?.isActive">
              <Button @click="stopBeatSync">
                {{ t('settings.pages.modules.beat_sync.sections.audio_source.actions.stop') }}
              </Button>
            </template>

            <template v-else>
              <Button
                :disabled="!audioSourceId || isLoadingAudioSources || starting"
                @click="startBeatSync"
              >
                {{ t('settings.pages.modules.beat_sync.sections.audio_source.actions.start') }}
              </Button>
            </template>
          </div>
        </div>

        <Alert
          v-if="audioSourceError"
          type="error"
        >
          <template #title>
            {{ t('settings.pages.modules.beat_sync.sections.audio_source.errors.list_failed') }}
          </template>
          <template #content>
            {{ audioSourceError }}
          </template>
        </Alert>

        <Alert
          v-if="startError"
          type="error"
        >
          <template #title>
            {{ t('settings.pages.modules.beat_sync.sections.audio_source.errors.start_failed') }}
          </template>
          <template #content>
            {{ startError }}
          </template>
        </Alert>
      </div>
    </SettingsCard>

    <div flex="~ col gap-6 items-center" class="w-full md:w-[40%]">
      <div class="max-w-400px w-full flex flex-col gap-3">
        <div class="w-full flex flex-col gap-3 rounded-2xl bg-neutral-100 p-4 dark:bg-neutral-900">
          <div>
            <div class="text-sm font-medium">
              {{ t('settings.pages.modules.beat_sync.sections.vibe.title') }}
            </div>
            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ t('settings.pages.modules.beat_sync.sections.vibe.description') }}
            </div>
          </div>

          <FieldRange
            v-model="vibeEnergyGain"
            :label="t('settings.pages.modules.beat_sync.sections.vibe.sensitivity.label')"
            :description="t('settings.pages.modules.beat_sync.sections.vibe.sensitivity.description')"
            :min="MIN_BEAT_SYNC_VIBE_ENERGY_GAIN"
            :max="MAX_BEAT_SYNC_VIBE_ENERGY_GAIN"
            :step="0.05"
            :format-value="value => `${Math.round(value * 100)}%`"
          />

          <FieldRange
            v-model="dancePulseHits"
            :label="t('settings.pages.modules.beat_sync.sections.vibe.hit_window.label')"
            :description="t('settings.pages.modules.beat_sync.sections.vibe.hit_window.description')"
            :min="MIN_BEAT_SYNC_HIT_WINDOW"
            :max="MAX_BEAT_SYNC_HIT_WINDOW"
            :step="1"
            :format-value="value => `${value} hits`"
          />

          <div>
            <div class="mb-1 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-300">
              <span>{{ t('settings.pages.modules.beat_sync.sections.vibe.energy') }}</span>
              <span>{{ energyPercent }}%</span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                class="h-full rounded-full bg-primary-400"
                :style="{ width: `${energyPercent}%` }"
              />
            </div>
          </div>

          <div>
            <div class="mb-1 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-300">
              <span>{{ t('settings.pages.modules.beat_sync.sections.vibe.punch') }}</span>
              <span>{{ punchPercent }}%</span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                class="h-full rounded-full bg-amber-400"
                :style="{ width: `${punchPercent}%` }"
              />
            </div>
          </div>

          <div>
            <div class="mb-1 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-300">
              <span>{{ t('settings.pages.modules.beat_sync.sections.vibe.hit') }}</span>
              <span>{{ hitPercent }}%</span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                class="h-full rounded-full bg-emerald-400"
                :style="{ width: `${hitPercent}%` }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.beat_sync.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
