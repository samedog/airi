export interface WaitForSpeechSettledOptions {
  /**
   * How long the character must stay quiet before the wait returns.
   *
   * The response turn of a reply usually stays open for its whole generation,
   * so this only has to catch a second response that starts right after the
   * first one drained.
   */
  settleMs?: number
  /** Safety cap: the caller proceeds even when speech never settles, for example a stuck producer. */
  timeoutMs?: number
  /** How often the busy state is read. */
  pollMs?: number
}

/**
 * Resolves once the character has finished talking.
 *
 * Use when:
 * - Work must begin after a reply, such as starting a song.
 *
 * Expects:
 * - `isBusy` reports a response that is still streaming or playing, not only a
 *   voice that is audible right now; a reply that has not reached the speech
 *   engine yet must not be talked over.
 *
 * Returns:
 * - A promise that resolves after `settleMs` of quiet, or at `timeoutMs`.
 */
export async function waitForSpeechSettled(
  isBusy: () => boolean,
  options: WaitForSpeechSettledOptions = {},
): Promise<void> {
  const { settleMs = 500, timeoutMs = 90_000, pollMs = 100 } = options
  const startedAt = Date.now()
  let quietSince: number | undefined

  while (Date.now() - startedAt < timeoutMs) {
    if (isBusy()) {
      // Speech resumed: the settle window restarts from the next quiet moment.
      quietSince = undefined
    }
    else if (quietSince === undefined) {
      quietSince = Date.now()
      if (settleMs <= 0)
        return
    }
    else if (Date.now() - quietSince >= settleMs) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, pollMs))
  }
}
