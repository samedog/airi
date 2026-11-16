// @vitest-environment jsdom

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  getBeatSyncState,
  isBeatSyncSupported,
  listenBeatSyncBeatSignal,
  listenBeatSyncStateChange,
  listenBeatSyncVibeSignal,
  toggleBeatSync,
} from './detector'

describe('capacitor Beat Sync runtime', () => {
  beforeAll(() => {
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'capacitor')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('registers and removes inactive listeners without throwing', () => {
    const removeStateListener = listenBeatSyncStateChange(vi.fn())
    const removeBeatListener = listenBeatSyncBeatSignal(vi.fn())
    const removeVibeListener = listenBeatSyncVibeSignal(vi.fn())

    expect(removeStateListener).toBeTypeOf('function')
    expect(removeBeatListener).toBeTypeOf('function')
    expect(removeVibeListener).toBeTypeOf('function')
    expect(() => removeStateListener()).not.toThrow()
    expect(() => removeBeatListener()).not.toThrow()
    expect(() => removeVibeListener()).not.toThrow()
  })

  it('returns a deterministic inactive state', async () => {
    expect(isBeatSyncSupported()).toBe(false)
    await expect(getBeatSyncState()).resolves.toEqual({ isActive: false })
  })

  it('allows an inactive toggle to settle', async () => {
    await expect(toggleBeatSync(false)).resolves.toBeUndefined()
  })

  it('rejects attempts to enable unsupported screen capture', async () => {
    await expect(toggleBeatSync(true)).rejects.toThrow('Beat Sync is not available in Stage Pocket')
  })
})
