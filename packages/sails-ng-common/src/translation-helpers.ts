/**
 * Guess at whether the key is a natural language string.
 * This is useful for translating only keys that are likely to be translation codes.
 *
 * TODO: The long-term goal is to have everything specify if it is natural langauge or translation code,
 *       to remove the need for this method.
 *
 * @param key The string to guess as natual language or not.
 */
export function isLikelyNaturalLanguage(key: string | null | undefined): boolean {
  const value = (key ?? "").trim();

  // An empty string is not natural language or translation code.
  if (!value) {
    return false;
  }

  // Likely natural language if contains a space or starts with a capital letter.
  if (value.includes(' ') || (value[0].toLowerCase() !== value[0])) {
    return true;
  }

  // Likely a translation code if starts with '@', or contains ':' or contains '_'.
  if (value.startsWith('@') || value.includes(':') || value.includes('_')) {
    return false;
  }

  // Otherwise, be conservative and say the translation key is not natural language.
  return false;
}
