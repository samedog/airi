import { describe, expect, it } from 'vitest'

import { clampBeatSyncVibeEnergyGain } from './settings'

describe('beat sync settings', () => {
  it('clamps persisted energy gain to the supported range', () => {
    expect(clampBeatSyncVibeEnergyGain(0.1)).toBe(0.5)
    expect(clampBeatSyncVibeEnergyGain(1.5)).toBe(1.5)
    expect(clampBeatSyncVibeEnergyGain(3)).toBe(2.5)
    expect(clampBeatSyncVibeEnergyGain(Number.NaN)).toBe(1)
    expect(clampBeatSyncVibeEnergyGain(Number.POSITIVE_INFINITY)).toBe(1)
    expect(clampBeatSyncVibeEnergyGain(undefined)).toBe(1)
  })
})
