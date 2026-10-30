import { describe, expect, it } from 'vitest'

import { formatVrmActPrompt } from './vrm-act'

describe('vrm ACT prompt', () => {
  it('returns nothing when the library is empty', () => {
    expect(formatVrmActPrompt([])).toBe('')
  })

  it('lists exact motion names and the combined emotion form', () => {
    const prompt = formatVrmActPrompt([
      { name: 'Standing Arguing' },
      { name: 'Idle' },
      { name: 'Standing Arguing' },
    ])

    expect(prompt).toContain('Motion controls the body. Emotion controls the face.')
    expect(prompt).toContain('<|ACT {"motion":"Standing Arguing"}|>')
    expect(prompt).toContain('<|ACT {"emotion":"happy","motion":"Standing Arguing"}|>')
    expect(prompt).toContain('- "Standing Arguing"')
    expect(prompt).toContain('- "Idle"')
    expect(prompt.match(/- "Standing Arguing"/g)).toHaveLength(1)
  })
})
