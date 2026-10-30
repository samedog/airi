/** Maximum number of motion names added to one system prompt. */
const MAX_VRM_ACT_MOTIONS = 64

/**
 * Builds the ACT instructions for the user's VRM body animation library.
 *
 * Motion drives the body. Emotion drives the face. A single ACT token may carry
 * both, for example `{ "emotion": "angry", "motion": "Standing Arguing" }`.
 */
export function formatVrmActPrompt(motions: readonly { name: string }[]): string {
  const names = [...new Set(
    motions
      .map(motion => motion.name.trim())
      .filter(name => name.length > 0),
  )].slice(0, MAX_VRM_ACT_MOTIONS)
  if (names.length === 0)
    return ''

  const example = JSON.stringify(names[0])
  return [
    'VRM body motion library for the current model:',
    'Motion controls the body. Emotion controls the face. They can be combined in one token.',
    'Use only the exact motion names from this list.',
    `Play a motion with: <|ACT {"motion":${example}}|>`,
    `Combine with an emotion with: <|ACT {"emotion":"happy","motion":${example}}|>`,
    'Available motions:',
    names.map(name => `- ${JSON.stringify(name)}`).join('\n'),
  ].join('\n')
}
