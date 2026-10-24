import path from 'node:path';
import type { RequestHandler, Request, Response } from 'express';

export interface PageHeaderInput {
  /** Configured external URL; request and forwarded headers do not select security policy. */
  readonly publicUrl?: string;
  readonly sessionMaxAgeMs?: number;
  readonly noCache?: readonly string[];
}

export function isImmutableAssetPath(requestPath: string): boolean {
  return (
    (/^\/(?:[^/]+\/[^/]+\/)?(?:js|styles|images|fonts|angular|icons)\//.test(requestPath) ||
      /^\/(?:apple-touch-icon|favicon-|site\.webmanifest)/.test(requestPath)) &&
    /(?:^|[-.])[A-Za-z0-9]{8,}\.[^.]+$/.test(path.posix.basename(requestPath))
  );
}

/** Public caching is enabled only after a declared static artifact has resolved. */
export function applyPageHeaders(
  req: Pick<Request, 'path'>,
  res: Pick<Response, 'set' | 'removeHeader'>,
  input: PageHeaderInput,
  staticArtifact = false
): void {
  const immutable = staticArtifact && isImmutableAssetPath(req.path);
  const seconds = input.sessionMaxAgeMs === undefined ? 31536000 : input.sessionMaxAgeMs / 1000;
  const noCache = seconds > 0 && input.noCache?.some(suffix => req.path.endsWith(suffix));
  const maxAge = seconds > 0 ? seconds : 31536000;
  res.set({
    'Cache-Control': immutable
      ? 'public, max-age=31536000, immutable'
      : noCache
        ? 'no-cache, no-store'
        : `max-age=${maxAge}, private`,
    Expires: new Date(immutable ? Date.now() + 31536000000 : noCache ? 0 : Date.now() + maxAge * 1000).toUTCString(),
  });
  // Browsers reject this secure-context policy on ordinary HTTP origins.
  if (input.publicUrl && new URL(input.publicUrl).protocol === 'https:')
    res.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (immutable) res.removeHeader('Pragma');
  else res.set('Pragma', 'no-cache');
}

export function pageResponseHeaders(input: PageHeaderInput): RequestHandler {
  return (req, res, next) => {
    applyPageHeaders(req, res, input);
    next();
  };
}
