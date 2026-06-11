/**
 * Escape content for HTML text nodes only.
 * Do not use this for HTML attributes, URLs, CSS, or JavaScript contexts.
 */
export function escapeHtmlText(value: unknown): string {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/**
 * Convert base64-encoded text to Unicode text.
 * @param value The encoded string.
 */
export function decodeBase64(value: string): string {
  const binString = atob(value);
  const bytes = Uint8Array.from(binString, (m) => {
    const cp = m.codePointAt(0);
    if (cp === undefined) {
      throw new Error(`Cannot decode base64 string due to unknown code point.`);
    }
    return cp;
  });
  return new TextDecoder().decode(bytes);
}

/**
 * Convert arbitrary Unicode text to base64 encoding.
 * @param value The text to convert to base64.
 */
export function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const binString = Array.from(bytes, (byte) =>
    String.fromCodePoint(byte),
  ).join("");
  return btoa(binString);
}
