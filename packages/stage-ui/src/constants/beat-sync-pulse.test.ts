import { describe, expect, it } from 'vitest'

import { clampBeatSyncHitWindow, dancePulseRate, dancePulseTargetSpeed } from './beat-sync-pulse'

describe('beat sync dance pulse', () => {
  it('maps HIT rate to dance speed', () => {
    expect(dancePulseTargetSpeed(0)).toBe(0.5)
    expect(dancePulseTargetSpeed(1)).toBe(0.5)
    expect(dancePulseTargetSpeed(2)).toBe(1)
    expect(dancePulseTargetSpeed(3)).toBe(1.5)
    expect(dancePulseTargetSpeed(4)).toBe(2)
  })

  it('clamps rate outside the useful range', () => {
    expect(dancePulseTargetSpeed(100)).toBe(2)
    expect(dancePulseTargetSpeed(-1)).toBe(0.5)
    expect(dancePulseTargetSpeed(undefined)).toBe(0.5)
  })

  it('calculates rate from the last HIT timestamps', () => {
    expect(dancePulseRate([1, 2, 3], 3)).toBeCloseTo(1)
    expect(dancePulseRate([1, 2, 3], 2)).toBeCloseTo(2)
    expect(dancePulseRate([1], 1)).toBeUndefined()
  })

  it('requires at least two HIT timestamps', () => {
    expect(dancePulseRate([], 10)).toBeUndefined()
    expect(dancePulseRate([1], 10)).toBeUndefined()
  })

  it('treats invalid target rates as the minimum', () => {
    expect(dancePulseTargetSpeed(Number.NaN)).toBe(0.5)
    expect(dancePulseTargetSpeed(0)).toBe(0.5)
  })

  it('clamps persisted HIT windows to the supported range', () => {
    expect(clampBeatSyncHitWindow(0)).toBe(4)
    expect(clampBeatSyncHitWindow(3)).toBe(4)
    expect(clampBeatSyncHitWindow(12)).toBe(12)
    expect(clampBeatSyncHitWindow(33)).toBe(32)
    expect(clampBeatSyncHitWindow(Number.NaN)).toBe(12)
    expect(clampBeatSyncHitWindow(Number.POSITIVE_INFINITY)).toBe(12)
    expect(clampBeatSyncHitWindow(undefined)).toBe(12)
  })
})
