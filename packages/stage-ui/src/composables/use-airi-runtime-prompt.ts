import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { EMOTION_EmotionMotionName_value, EMOTION_VALUES } from '../constants/emotions'

const RUNTIME_PROMPT_KEYS = [
  'base.prompt.emotion',
  'base.prompt.emoji',
  'base.prompt.suffix',
]

/**
 * Fork-only: tells the model it can perform karaoke.
 *
 * Kept out of the i18n bundle on purpose. The keys above are guarded by `te()`,
 * so a locale missing this line would blank the entire runtime prompt; a plain
 * capability sentence is safer and only has to be right in one language for the
 * model to act on it.
 */
const KARAOKE_PROMPT = [
  'Karaoke: you can perform any song installed in the app.',
  'Whenever the owner asks for a song — even casually, like "sing me something",',
  '"any songs you want to sing?" or "can you sing?" — call `builtIn_singSong` with',
  'the title they named, or with "any" when they did not name one. Call',
  '`builtIn_stopSong` to stop.',
  'Never improvise lyrics and never refuse a request to sing: if the tool reports a',
  'problem, say what it reported.',
].join(' ')

/**
 * Fork-only: keep replies, memories and tool arguments in the language the owner
 * just used.
 *
 * Without it the persona answers in its own language while the owner writes
 * English, so "please remember this" stored a German memory entry, and the
 * `call_summary` labels ("in the language of your reply") came out German too.
 * The memory tool itself carries no language rule, so this is the only place
 * that can enforce it for every request.
 */
const LANGUAGE_PROMPT = [
  'Language: answer in the language of the owner\'s latest message.',
  'Write tool arguments in that language as well — memory entries, call labels and song titles.',
  'Only switch language when the owner switches first.',
].join(' ')

/** Returns the localized emotion and emoji prompt for each model request. */
export function useAiriRuntimePrompt() {
  const { locale, t, te } = useI18n()

  return computed(() => {
    if (!RUNTIME_PROMPT_KEYS.every(key => te(key, locale.value)))
      return ''

    return [
      t('base.prompt.emotion'),
      EMOTION_VALUES
        .map(emotion => `- ${emotion} (Emotion for feeling ${EMOTION_EmotionMotionName_value[emotion]})`)
        .join('\n'),
      t('base.prompt.suffix'),
      t('base.prompt.emoji'),
      LANGUAGE_PROMPT,
      KARAOKE_PROMPT,
    ].join('\n\n')
  })
}
