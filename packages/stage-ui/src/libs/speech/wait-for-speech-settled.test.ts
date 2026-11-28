import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { waitForSpeechSettled } from './wait-for-speech-settled'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** Reports when the promise resolved, so a test can assert before and after. */
function track(promise: Promise<void>) {
  let settled = false
  void promise.then(() => {
    settled = true
  })
  return () => settled
}

describe('waitForSpeechSettled', () => {
  it('returns after the quiet window when no reply is speaking', async () => {
    const settled = track(waitForSpeechSettled(() => false))

    await vi.advanceTimersByTimeAsync(400)
    expect(settled()).toBe(false)

    await vi.advanceTimersByTimeAsync(200)
    expect(settled()).toBe(true)
  })

  it('waits for the whole reply, not for the moment it stops being audible', async () => {
    let busy = true
    const settled = track(waitForSpeechSettled(() => busy))

    await vi.advanceTimersByTimeAsync(5_000)
    expect(settled()).toBe(false)

    // The reply drained at once, and the song waits out the settle window.
    busy = false
    await vi.advanceTimersByTimeAsync(400)
    expect(settled()).toBe(false)

    await vi.advanceTimersByTimeAsync(200)
    expect(settled()).toBe(true)
  })

  it('restarts the window when another reply starts speaking', async () => {
    let busy = false
    const settled = track(waitForSpeechSettled(() => busy))

    // Quiet for less than the window, then a second response begins.
    await vi.advanceTimersByTimeAsync(300)
    busy = true
    await vi.advanceTimersByTimeAsync(500)
    busy = false

    // 300 ms of the first quiet window must not count towards the second.
    await vi.advanceTimersByTimeAsync(400)
    expect(settled()).toBe(false)

    await vi.advanceTimersByTimeAsync(200)
    expect(settled()).toBe(true)
  })

  it('gives up at the timeout so a stuck producer cannot keep the song waiting', async () => {
    const settled = track(waitForSpeechSettled(() => true, { timeoutMs: 1_000 }))

    await vi.advanceTimersByTimeAsync(900)
    expect(settled()).toBe(false)

    await vi.advanceTimersByTimeAsync(200)
    expect(settled()).toBe(true)
  })

  it('honours a zero settle window for callers that only need the drain', async () => {
    let busy = true
    const settled = track(waitForSpeechSettled(() => busy, { settleMs: 0 }))

    await vi.advanceTimersByTimeAsync(200)
    expect(settled()).toBe(false)

    busy = false
    await vi.advanceTimersByTimeAsync(200)
    expect(settled()).toBe(true)
  })
})
