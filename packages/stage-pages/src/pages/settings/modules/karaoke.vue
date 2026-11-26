<script setup lang="ts">
import type { KaraokeSongAsset } from '@proj-airi/stage-shared/karaoke'

import { errorMessageFrom } from '@moeru/std'
import { useKaraokeStore } from '@proj-airi/stage-ui/stores/karaoke'
import { useKaraokePlayerStore } from '@proj-airi/stage-ui/stores/karaoke-player'
import { Alert, Button, GhostButton, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const karaoke = useKaraokeStore()
const player = useKaraokePlayerStore()
const { songs, loading, error, supported, selectedSongId } = storeToRefs(karaoke)
const { activeState } = storeToRefs(player)
// The stage window plays the song and reports back. This page is the remote control.
const isPlaying = computed(() => activeState.value.isPlaying)
const playingSongId = computed(() => activeState.value.songId)
const currentTime = computed(() => activeState.value.currentTime)
const duration = computed(() => activeState.value.duration)
const actionError = ref<string>()

watch(activeState, (state) => {
  if (state.error)
    actionError.value = state.error
})

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0)
    return '—'
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0)
    return '—'
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function playSong(song: KaraokeSongAsset) {
  actionError.value = undefined
  try {
    karaoke.selectSong(song.id)
    await player.requestPlay(song.id)
  }
  catch (cause) {
    actionError.value = errorMessageFrom(cause) ?? t('settings.pages.modules.karaoke.errors.play_failed')
  }
}

async function removeSong(song: KaraokeSongAsset) {
  actionError.value = undefined
  try {
    if (playingSongId.value === song.id)
      player.requestStop()
    await karaoke.removeSong(song.id)
  }
  catch (cause) {
    actionError.value = errorMessageFrom(cause) ?? t('settings.pages.modules.karaoke.errors.remove_failed')
  }
}

onMounted(() => {
  void karaoke.refresh()
})
</script>

<template>
  <div flex="~ col md:row gap-6">
    <SettingsCard class="md:w-[60%]">
      <div flex="~ col gap-6">
        <div flex="~ col gap-4">
          <div>
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
              {{ t('settings.pages.modules.karaoke.sections.library.title') }}
            </h2>
            <div text="neutral-400 dark:neutral-400">
              <span>{{ t('settings.pages.modules.karaoke.sections.library.description') }}</span>
            </div>
          </div>

          <div max-w-full flex="~ row gap-4 wrap">
            <Button variant="secondary" :disabled="loading" @click="karaoke.refresh()">
              {{ t('settings.pages.modules.karaoke.sections.library.actions.refresh') }}
            </Button>
            <GhostButton :disabled="!supported" @click="karaoke.reveal()">
              {{ t('settings.pages.modules.karaoke.sections.library.actions.reveal') }}
            </GhostButton>
            <Button v-if="isPlaying" variant="secondary" @click="player.requestStop()">
              {{ t('settings.pages.modules.karaoke.sections.library.actions.stop') }}
            </Button>
          </div>
        </div>

        <Alert v-if="!supported" tone="warning">
          <template #title>
            {{ t('settings.pages.modules.karaoke.sections.library.desktop_only.title') }}
          </template>
          {{ t('settings.pages.modules.karaoke.sections.library.desktop_only.description') }}
        </Alert>

        <Alert v-if="error" tone="danger">
          <template #title>
            {{ t('settings.pages.modules.karaoke.errors.load_failed') }}
          </template>
          {{ error }}
        </Alert>

        <Alert v-if="actionError" tone="danger">
          <template #title>
            {{ t('settings.pages.modules.karaoke.errors.action_failed') }}
          </template>
          {{ actionError }}
        </Alert>

        <div
          v-if="!loading && supported && !songs.length"
          class="flex flex-col gap-2 rounded-2xl bg-neutral-100 p-4 text-sm text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400"
        >
          <span class="text-neutral-600 font-medium dark:text-neutral-300">
            {{ t('settings.pages.modules.karaoke.sections.library.empty.title') }}
          </span>
          <span>{{ t('settings.pages.modules.karaoke.sections.library.empty.description') }}</span>
        </div>

        <ul v-if="songs.length" class="flex flex-col gap-2">
          <li
            v-for="song in songs"
            :key="song.id"
            class="flex flex-col gap-2 rounded-2xl bg-neutral-100 p-4 dark:bg-neutral-900"
            :class="{ 'ring-1 ring-primary-400': selectedSongId === song.id }"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 flex flex-col gap-1">
                <span class="truncate text-sm font-medium">{{ song.name }}</span>
                <span class="text-xs text-neutral-500 dark:text-neutral-400">
                  {{ formatDuration(song.durationSec) }}
                  <template v-if="song.bpm"> · {{ Math.round(song.bpm) }} BPM</template>
                  · {{ formatSize(song.size) }}
                  <template v-if="song.hasLyrics"> · lyrics</template>
                  <template v-if="song.hasVisemes"> · visemes</template>
                  <template v-if="song.hasStems"> · stems</template>
                </span>
              </div>
              <div class="flex shrink-0 flex-row gap-2">
                <Button
                  v-if="isPlaying && playingSongId === song.id"
                  variant="secondary"
                  @click="player.requestStop()"
                >
                  {{ t('settings.pages.modules.karaoke.sections.library.actions.stop') }}
                </Button>
                <Button v-else @click="playSong(song)">
                  {{ t('settings.pages.modules.karaoke.sections.library.actions.play') }}
                </Button>
                <GhostButton @click="removeSong(song)">
                  {{ t('settings.pages.modules.karaoke.sections.library.actions.remove') }}
                </GhostButton>
              </div>
            </div>
            <div
              v-if="isPlaying && playingSongId === song.id"
              class="h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
            >
              <div
                class="h-full rounded-full bg-primary-400 transition-[width] duration-150"
                :style="{ width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%` }"
              />
            </div>
          </li>
        </ul>
      </div>
    </SettingsCard>

    <div flex="~ col gap-6 items-center" class="w-full md:w-[40%]">
      <div class="max-w-400px w-full flex flex-col gap-3 rounded-2xl bg-neutral-100 p-4 dark:bg-neutral-900">
        <div class="text-sm font-medium">
          {{ t('settings.pages.modules.karaoke.sections.howto.title') }}
        </div>
        <ol class="flex flex-col list-decimal gap-2 pl-4 text-xs text-neutral-500 dark:text-neutral-400">
          <li>{{ t('settings.pages.modules.karaoke.sections.howto.step_convert') }}</li>
          <li>{{ t('settings.pages.modules.karaoke.sections.howto.step_render') }}</li>
          <li>{{ t('settings.pages.modules.karaoke.sections.howto.step_install') }}</li>
          <li>{{ t('settings.pages.modules.karaoke.sections.howto.step_refresh') }}</li>
        </ol>
      </div>
    </div>
  </div>
</template>
