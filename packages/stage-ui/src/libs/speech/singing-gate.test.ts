import { afterEach, describe, expect, it } from 'vitest'

import { karaokeSinging, setKaraokeSinging, silentWhileSinging } from './singing-gate'

afterEach(() => setKaraokeSinging(false))

describe('singingGate', () => {
  it('keeps replies and Spark notifications quiet while a song plays', () => {
    setKaraokeSinging(true)

    expect(silentWhileSinging('answer')).toBe(true)
    expect(silentWhileSinging('notification')).toBe(true)
  })

  it('leaves a read-aloud alone, because the owner asked for that text', () => {
    setKaraokeSinging(true)

    expect(silentWhileSinging('read-aloud')).toBe(false)
    expect(silentWhileSinging('')).toBe(false)
  })

  it('lets every purpose speak when no song plays', () => {
    expect(karaokeSinging.value).toBe(false)

    for (const purpose of ['answer', 'notification', 'read-aloud']) {
      expect(silentWhileSinging(purpose)).toBe(false)
      setKaraokeSinging(true)
      setKaraokeSinging(false)
    }
  })

  it('publishes the singing state the stage reads', () => {
    expect(karaokeSinging.value).toBe(false)

    setKaraokeSinging(true)
    expect(karaokeSinging.value).toBe(true)

    setKaraokeSinging(false)
    expect(karaokeSinging.value).toBe(false)
  })
})
