import { randomBytes, createHash } from 'node:crypto';
import { EmailTemplateError } from '../services/EmailTemplateService';

export const EMAIL_PREVIEW_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: http: data:; font-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox";
export const EMAIL_PREVIEW_TTL_MS = 60000;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_FRAMES = 64;
const MAX_OWNER_FRAMES = 4;
interface Frame {
  brand: string;
  owner: string;
  html: string;
  expires: number;
  bytes: number;
  uses: number;
}
const frames = new Map<string, Frame>();

function prune(now: number): void {
  for (const [token, frame] of frames) if (frame.expires <= now) frames.delete(token);
}

/** Opaque capability, retained in memory only. The caller must have already rendered/sanitised. */
export function issueEmailPreviewFrame(
  brand: string,
  user: string,
  session: string,
  html: string,
  now = Date.now()
): string {
  if (!user || !session) throw new EmailTemplateError('FORBIDDEN', 'An authenticated session is required.');
  prune(now);
  const owner = createHash('sha256')
    .update(JSON.stringify([user, session]))
    .digest('hex');
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_FRAME_BYTES) throw new EmailTemplateError('LENGTH_LIMIT', 'Preview frame is too large.');
  const owned = [...frames].filter(([, frame]) => frame.owner === owner);
  while (owned.length >= MAX_OWNER_FRAMES) frames.delete(owned.shift()![0]);
  let total = [...frames.values()].reduce((sum, frame) => sum + frame.bytes, 0);
  while (frames.size >= MAX_FRAMES || total + bytes > MAX_FRAME_BYTES) {
    const [oldest, frame] = frames.entries().next().value!;
    frames.delete(oldest);
    total -= frame.bytes;
  }
  const token = randomBytes(32).toString('base64url');
  frames.set(token, { brand, owner, html, expires: now + EMAIL_PREVIEW_TTL_MS, bytes, uses: 0 });
  return token;
}

/** Four reads allow iframe mode toggles/reloads; no extension of the absolute 60s lifetime. */
export function readEmailPreviewFrame(
  token: string,
  brand: string,
  user: string,
  session: string,
  now = Date.now()
): string {
  prune(now);
  const frame = /^[\w-]{43}$/.test(token) ? frames.get(token) : undefined;
  const owner = createHash('sha256')
    .update(JSON.stringify([user, session]))
    .digest('hex');
  if (!user || !session || !frame || frame.brand !== brand || frame.owner !== owner || frame.uses >= 4)
    throw new EmailTemplateError('PREVIEW_FRAME_UNAVAILABLE', 'Preview frame is unavailable.');
  frame.uses++;
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light">' +
    '<style>html{background:#fff}body{margin:0;padding:20px 24px;color:#1f2328;font:14px/1.55 sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>' +
    `</head><body>${frame.html}</body></html>`
  );
}
