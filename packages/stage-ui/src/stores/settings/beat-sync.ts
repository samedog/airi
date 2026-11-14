import { clampBeatSyncVibeEnergyGain, DEFAULT_BEAT_SYNC_VIBE_ENERGY_GAIN } from '@proj-airi/stage-shared/beat-sync'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { watch } from 'vue'

export const useSettingsBeatSync = defineStore('settings-beat-sync', () => {
  // Remove settings that no longer have a consumer.
  try {
    globalThis.localStorage?.removeItem('settings/beat-sync/parameters')
    globalThis.localStorage?.removeItem('settings/beat-sync/spectrum-scale')
    globalThis.localStorage?.removeItem('settings/beat-sync/dance-pulse-hits')
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

  // Normalize persisted and cross-window values before the UI or Stage sees
  // them. VueUse's number serializer turns malformed strings into NaN.
  watch(vibeEnergyGain, (value) => {
    const clamped = clampBeatSyncVibeEnergyGain(value)
    if (value !== clamped)
      vibeEnergyGain.value = clamped
  }, { immediate: true })
  function resetState() {
    audioSourceId.reset()
    vibeEnergyGain.reset()
  }

  return {
    audioSourceId,
    vibeEnergyGain,
    resetState,
  }
})
