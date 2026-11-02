import { describe, expect, it } from 'vitest'

import {
  normalizeVrmAnimationBinding,
  normalizeVrmAnimationBindings,
  removeVrmAnimationAssetFromBindings,
  selectVrmAnimationAssetId,
  selectVrmAnimationClipByEnergy,
  selectVrmAnimationEnergyTier,
} from './vrm-animations'

describe('vrm animation bindings', () => {
  it('migrates a legacy single string to a clip entry', () => {
    expect(normalizeVrmAnimationBinding('idle-a')).toEqual([{ id: 'idle-a' }])
  })

  it('trims, deduplicates, and drops empty IDs', () => {
    expect(normalizeVrmAnimationBinding([' idle-a ', 'idle-a', '', 'idle-b']))
      .toEqual([{ id: 'idle-a' }, { id: 'idle-b' }])
  })

  it('normalizes intensity tags and lets the last duplicate win', () => {
    expect(normalizeVrmAnimationBinding([
      { id: 'dance-a', energy: 0.8 },
      { id: 'dance-b', energy: 2 },
      { id: 'dance-c', energy: -1 },
      { id: 'dance-a', energy: 0.4 },
    ])).toEqual([
      { id: 'dance-a', energy: 0.4 },
      { id: 'dance-b', energy: 1 },
      { id: 'dance-c', energy: 0 },
    ])
  })

  it('normalizes every slot and removes empty slots', () => {
    expect(normalizeVrmAnimationBindings({
      happy: 'happy-a',
      sad: ['sad-a', 'sad-a'],
      angry: [],
    })).toEqual({
      happy: [{ id: 'happy-a' }],
      sad: [{ id: 'sad-a' }],
    })
  })

  it('removes one asset from every slot', () => {
    const result = removeVrmAnimationAssetFromBindings({
      idle: [{ id: 'shared' }],
      dance: [{ id: 'shared', energy: 0.8 }, { id: 'keep', energy: 0.2 }],
      happy: [{ id: 'keep' }],
    }, 'shared')

    expect(result.changed).toBe(true)
    expect(result.bindings).toEqual({
      dance: [{ id: 'keep', energy: 0.2 }],
      happy: [{ id: 'keep' }],
    })
  })

  it('reports no change when the asset is not bound', () => {
    const result = removeVrmAnimationAssetFromBindings({
      happy: [{ id: 'keep' }],
    }, 'missing')

    expect(result.changed).toBe(false)
    expect(result.bindings).toEqual({ happy: [{ id: 'keep' }] })
  })

  it('returns no asset for an empty slot', () => {
    expect(selectVrmAnimationAssetId({}, 'happy')).toBeUndefined()
    expect(selectVrmAnimationAssetId({ happy: [] }, 'happy')).toBeUndefined()
  })

  it('always returns the only bound asset', () => {
    expect(selectVrmAnimationAssetId({ happy: ['happy-a'] }, 'happy', {
      previousId: 'happy-a',
      random: () => 0.99,
    })).toBe('happy-a')
  })

  it('avoids the previous asset when another choice exists', () => {
    expect(selectVrmAnimationAssetId({ happy: ['happy-a', 'happy-b', 'happy-c'] }, 'happy', {
      previousId: 'happy-a',
      random: () => 0,
    })).toBe('happy-b')

    expect(selectVrmAnimationAssetId({ happy: ['happy-a', 'happy-b', 'happy-c'] }, 'happy', {
      previousId: 'happy-a',
      random: () => 0.99,
    })).toBe('happy-c')
  })

  it('falls back to the full pool when the previous asset is no longer bound', () => {
    expect(selectVrmAnimationAssetId({ happy: ['happy-a', 'happy-b'] }, 'happy', {
      previousId: 'removed',
      random: () => 0.99,
    })).toBe('happy-b')
  })

  it('ignores untagged clips during energy selection', () => {
    expect(selectVrmAnimationClipByEnergy({ dance: ['dance-a'] }, 'dance', 0.5))
      .toBeUndefined()
  })

  it('treats auto clips as medium when another clip is tagged', () => {
    const bindings = {
      dance: [
        { id: 'dance-auto' },
        { id: 'dance-hot', energy: 0.8 },
      ],
    }

    expect(selectVrmAnimationClipByEnergy(bindings, 'dance', 0.5)?.id).toBe('dance-auto')
    expect(selectVrmAnimationClipByEnergy(bindings, 'dance', 0.9)?.id).toBe('dance-hot')
  })

  it('returns the same tier for the selector and the stage expression path', () => {
    const bindings = {
      dance: [
        { id: 'dance-calm', energy: 0.2 },
        { id: 'dance-mid', energy: 0.5 },
        { id: 'dance-hot', energy: 0.78 },
      ],
    }

    expect(selectVrmAnimationEnergyTier(bindings, 'dance', 0.1)).toBe(0.2)
    expect(selectVrmAnimationEnergyTier(bindings, 'dance', 0.52)).toBe(0.5)
    expect(selectVrmAnimationEnergyTier(bindings, 'dance', 0.95)).toBe(0.78)
    expect(selectVrmAnimationEnergyTier({ dance: ['dance-auto'] }, 'dance', 0.5)).toBeUndefined()
  })

  it('selects the highest threshold at or below energy', () => {
    const bindings = {
      dance: [
        { id: 'dance-calm', energy: 0.2 },
        { id: 'dance-mid', energy: 0.5 },
        { id: 'dance-hot', energy: 0.78 },
      ],
    }

    expect(selectVrmAnimationClipByEnergy(bindings, 'dance', 0.1)?.id).toBe('dance-calm')
    expect(selectVrmAnimationClipByEnergy(bindings, 'dance', 0.52)?.id).toBe('dance-mid')
    expect(selectVrmAnimationClipByEnergy(bindings, 'dance', 0.77)?.id).toBe('dance-mid')
    expect(selectVrmAnimationClipByEnergy(bindings, 'dance', 0.78)?.id).toBe('dance-hot')
    expect(selectVrmAnimationClipByEnergy(bindings, 'dance', 0.95)?.id).toBe('dance-hot')
  })

  it('returns the best tier regardless of the current clip', () => {
    const bindings = {
      dance: [
        { id: 'dance-calm', energy: 0.2 },
        { id: 'dance-mid', energy: 0.5 },
        { id: 'dance-hot', energy: 0.78 },
      ],
    }

    expect(selectVrmAnimationClipByEnergy(bindings, 'dance', 0.95, {
      previousId: 'dance-calm',
    })?.id).toBe('dance-hot')

    expect(selectVrmAnimationClipByEnergy(bindings, 'dance', 0.3, {
      previousId: 'dance-hot',
    })?.id).toBe('dance-calm')
  })

  it('drops malformed binding entries', () => {
    expect(normalizeVrmAnimationBinding([
      null,
      42,
      {},
      { id: 42 },
      { id: ' valid ' },
    ] as never)).toEqual([{ id: 'valid' }])
  })

  it('clamps injectable random selection bounds', () => {
    const bindings = { happy: ['happy-a', 'happy-b', 'happy-c'] }

    expect(selectVrmAnimationAssetId(bindings, 'happy', { random: () => 1 })).toBe('happy-c')
    expect(selectVrmAnimationAssetId(bindings, 'happy', { random: () => -1 })).toBe('happy-a')
  })
})
