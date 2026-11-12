import { redactSecret } from '../../utilities/RedactionUtils';

/** Only short diagnostic text belongs in audit records, never headers or payloads. */
export function sanitizeFigshareText(value: unknown, maxLength = 1000, secrets: string[] = []): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  let text = value;
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join('REDACTED');
  }
  text = text
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1REDACTED@')
    .replace(/\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 REDACTED')
    .replace(/((?:authorization|password|secret|credential|api[_-]?key|access[_-]?token|token)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^,;&}\r\n]+)/gi, '$1REDACTED')
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, '$1');
  return String(redactSecret(text)).trim().slice(0, maxLength);
}

export function sanitizeFigshareResponse(value: unknown, secrets: string[] = []): { code?: string; message?: string } | string | undefined {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    const body = value as Record<string, unknown>;
    const code = sanitizeFigshareText(body.code, 100, secrets);
    const message = typeof body.message === 'string' && !/<[^>]+>/.test(body.message)
      ? sanitizeFigshareText(body.message, 1000, secrets) : undefined;
    return { ...(code ? { code } : {}), ...(message ? { message } : {}) };
  }
  // HTML proxy responses can contain arbitrary page content; retain status/context only.
  return typeof value === 'string' && !/<[^>]+>/.test(value)
    ? sanitizeFigshareText(value, 1000, secrets) : undefined;
}
