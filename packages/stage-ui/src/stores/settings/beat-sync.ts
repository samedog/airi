import { clampBeatSyncVibeEnergyGain, DEFAULT_BEAT_SYNC_VIBE_ENERGY_GAIN } from '@proj-airi/stage-shared/beat-sync'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { clampBeatSyncHitWindow, DEFAULT_BEAT_SYNC_HIT_WINDOW } from '../../constants/beat-sync-pulse'

export const useSettingsBeatSync = defineStore('settings-beat-sync', () => {
  // Remove settings that no longer have a consumer.
  try {
    globalThis.localStorage?.removeItem('settings/beat-sync/parameters')
    globalThis.localStorage?.removeItem('settings/beat-sync/spectrum-scale')
  }
  catch {}

  const audioSourceId = useLocalStorageManualReset<string>(
    'settings/beat-sync/audio-source',
    '',
  )
  const vibeEnergyGain = useLocalStorageManualReset<number>(
    'settings/beat-sync/vibe-energy-gain',
    DEFAULT_BEAT_SYNC_VIBE_ENERGY_GAIN,
  )
  const dancePulseHits = useLocalStorageManualReset<number>(
    'settings/beat-sync/dance-pulse-hits',
    DEFAULT_BEAT_SYNC_HIT_WINDOW,
  )

  // Normalize persisted and cross-window values before the UI or Stage sees
  // them. VueUse's number serializer turns malformed strings into NaN.
  watch(vibeEnergyGain, (value) => {
    const clamped = clampBeatSyncVibeEnergyGain(value)
    if (value !== clamped)
      vibeEnergyGain.value = clamped
  }, { immediate: true })
  watch(dancePulseHits, (value) => {
    const clamped = clampBeatSyncHitWindow(value)
    if (value !== clamped)
      dancePulseHits.value = clamped
  }, { immediate: true })
  function resetState() {
    audioSourceId.reset()
    vibeEnergyGain.reset()
    dancePulseHits.reset()
  }

  return {
    audioSourceId,
    vibeEnergyGain,
    dancePulseHits,
    resetState,
  }
})
