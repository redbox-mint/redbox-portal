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