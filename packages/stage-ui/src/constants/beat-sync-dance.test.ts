import { describe, expect, it } from 'vitest'

import { beatSyncDanceSpeed, bpmFromBeatInterval } from './beat-sync-dance'

describe('beat sync dance speed', () => {
  it('converts beat intervals to BPM', () => {
    expect(bpmFromBeatInterval(0.5)).toBe(120)
    expect(bpmFromBeatInterval(0.25)).toBe(240)
    expect(bpmFromBeatInterval(0)).toBeUndefined()
    expect(bpmFromBeatInterval(Number.NaN)).toBeUndefined()
    expect(bpmFromBeatInterval(0.1)).toBeUndefined()
  })

  it('scales dance speed around 120 BPM and clamps it', () => {
    expect(beatSyncDanceSpeed(120, true)).toBe(1)
    expect(beatSyncDanceSpeed(60, true)).toBe(0.5)
    expect(beatSyncDanceSpeed(240, true)).toBe(2)
    expect(beatSyncDanceSpeed(300, true)).toBe(2)
    expect(beatSyncDanceSpeed(0, true)).toBe(1)
    expect(beatSyncDanceSpeed(120, false)).toBe(1)
  })
})
