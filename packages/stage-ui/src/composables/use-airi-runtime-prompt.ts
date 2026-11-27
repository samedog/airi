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
  'When the owner asks you to sing, call `builtIn_singSong` with the song title,',
  'or without a title to choose one yourself; call `builtIn_stopSong` to stop.',
  'Never claim you are singing without calling the tool.',
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
      KARAOKE_PROMPT,
    ].join('\n\n')
  })
}
