/**
 * Guess at whether the key is a natural language string.
 * This is useful for translating only keys that are likely to be translation codes.
 *
 * TODO: The long-term goal is to have everything specify if it is natural langauge or translation code,
 *       to remove the need for this method.
 *
 * @param key The string to guess as natual language or not.
 * @return True if the key is likely natural language and not a translation key.
 */
export function isLikelyNaturalLanguage(key: string | null | undefined): boolean {
  const value = String(key ?? "").trim();

  // An empty string is not natural language or translation code.
  if (!value) {
    return false;
  }

  // Likely natural language if contains a space or starts with a capital letter.
  if (value.includes(' ') || (value[0].toLowerCase() !== value[0])) {
    return true;
  }

  // Likely a translation code if starts with '@' or contains any of ':', '_', '{', '}'.
  if (
    value.startsWith('@') ||
    value.includes(':') ||
    value.includes('_') ||
    value.includes('{') ||
    value.includes('}')
  ) {
    return false;
  }

  // Otherwise, be conservative and say the translation key is not natural language.
  return false;
}

/**
 * Guess at the parts of a full name.
 *
 * TODO: This is best-effort only, and is likely to be incorrect.
 *       The long-term goal is to not have to guess at names.
 *       This is needed while some form fields prompt for full names and others need parts of names.
 *
 * @param value Guess at the parts of this full name.
 * @return Object with guessed values for full, first, and last names.
 */
export function guessNameParts(value: string) : {full: string, first: string, last: string} {
  let full = String(value ?? "").replace(/\s+/g, ' ').trim(),
    first = '',
    last= '';

  if (!full) {
    return {full, first, last};
  }

  // If there are no spaces, assume this is the last name.
  if (!full.includes(' ')){
    last = full;
    return {full, first, last};
  }

  // If there are spaces, assume the first 'word' is the first name, and the rest is the last name.
  const words = full.split(' ').filter(w => !!w?.trim());
  full = words.join(' ');
  first = words[0];
  last = words.slice(1).join(' ');
  return {full, first, last};
}
