/** Convert a translated HTML label for text interpolation or an accessible name.
 * Never insert the parsed nodes into the live document.
 */
export function labelToPlainText(label: string): string {
  // These applications render in the browser. Keep non-DOM consumers safe too.
  if (!/[<&]/.test(label) || typeof DOMParser === 'undefined') {
    return label;
  }

  // Explicit body preserves leading whitespace in labels that are only text.
  const parsed = new DOMParser().parseFromString(`<body>${label}`, 'text/html');
  const body = parsed.body;
  if (body.childElementCount === 0 && body.textContent === label) {
    // Preserve plain labels exactly, including whitespace and comparisons (a < b).
    return label;
  }

  body.querySelectorAll('script, style, template').forEach(element => element.remove());
  // textContent alone joins adjacent paragraphs and drops line breaks entirely.
  // Keep inline boundaries intact (e.g. re<strong>search</strong>).
  body.querySelectorAll('br, hr, p, div, li, ul, ol, dl, dt, dd, section, article, header, footer, blockquote, pre, h1, h2, h3, h4, h5, h6, tr, td, th')
    .forEach(element => {
      element.before(parsed.createTextNode(' '));
      element.after(parsed.createTextNode(' '));
    });
  return (body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
