// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { StageEnvironment } from '../environment'
import { createBeatSyncDetector, withInvokeTimeout } from './detector'

class FakeAudioNode {
  connect = vi.fn()
  disconnect = vi.fn()
}

class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048
  frequencyBinCount = 1024
  smoothingTimeConstant = 0
  getByteTimeDomainData = vi.fn()
  getByteFrequencyData = vi.fn()
}

class FakeGainNode extends FakeAudioNode {
  gain = { value: 0 }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []

  state = 'running'
  destination = new FakeAudioNode()
  closeCalls = 0

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  addEventListener() {}

  async resume() {}

  createAnalyser() {
    return new FakeAnalyserNode()
  }

  createGain() {
    return new FakeGainNode()
  }

  close() {
    this.closeCalls++
    this.state = 'closed'
    return Promise.resolve()
  }
}

function createSource() {
  return {
    // Test double only; the detector only calls connect/disconnect.
    // eslint-disable-next-line slop/no-chained-type-assertions
    node: new FakeAudioNode() as unknown as AudioNode,
    stop: vi.fn(),
  }
}

const originalAudioContext = globalThis.AudioContext

afterEach(() => {
  FakeAudioContext.instances = []
  globalThis.AudioContext = originalAudioContext
  vi.useRealTimers()
})

describe('beat sync detector lifecycle', () => {
  it('closes the context when source creation fails', async () => {
    // eslint-disable-next-line slop/no-chained-type-assertions
    globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext

    const detector = createBeatSyncDetector({ env: StageEnvironment.Web })

    await expect(detector.start(async () => {
      throw new Error('capture failed')
    })).rejects.toThrow('capture failed')

    expect(FakeAudioContext.instances).toHaveLength(1)
    expect(FakeAudioContext.instances[0]?.closeCalls).toBe(1)
    expect(detector.state.isActive).toBe(false)
  })

  it('invalidates the previous source after stop', async () => {
    // eslint-disable-next-line slop/no-chained-type-assertions
    globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext

    const detector = createBeatSyncDetector({ env: StageEnvironment.Web })
    let isCurrent: (() => boolean) | undefined

    await detector.start(async (_context, current) => {
      isCurrent = current
      return createSource()
    })

    expect(detector.state.isActive).toBe(true)
    expect(isCurrent?.()).toBe(true)

    detector.stop()

    expect(isCurrent?.()).toBe(false)
    expect(detector.state.isActive).toBe(false)
    expect(FakeAudioContext.instances[0]?.closeCalls).toBe(1)
  })

  it('rejects a pending toggle after its timeout', async () => {
    vi.useFakeTimers()
    const pending = new Promise<void>(() => {})

    const result = withInvokeTimeout(pending, 'Beat Sync toggle', 10)
    const assertion = expect(result).rejects.toThrow('Beat Sync toggle timed out')

    await vi.advanceTimersByTimeAsync(10)
    await assertion
  })

  it('drops a source that resolves after stop', async () => {
    // eslint-disable-next-line slop/no-chained-type-assertions
    globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext

    const detector = createBeatSyncDetector({ env: StageEnvironment.Web })
    let releaseSource: (() => void) | undefined
    let isCurrent: (() => boolean) | undefined
    const sourceReady = new Promise<void>((resolve) => {
      releaseSource = resolve
    })

    const startPromise = detector.start(async (_context, current) => {
      isCurrent = current
      await sourceReady
      return createSource()
    })

    await vi.waitFor(() => expect(isCurrent).toBeTypeOf('function'))
    detector.stop()
    releaseSource?.()
    await startPromise

    expect(isCurrent?.()).toBe(false)
    expect(detector.state.isActive).toBe(false)
    expect(FakeAudioContext.instances[0]?.closeCalls).toBe(1)
  })
})
