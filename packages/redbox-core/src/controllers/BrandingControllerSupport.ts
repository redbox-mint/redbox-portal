export interface BrandingErrorMapping {
  status: number;
  code: string;
  detail?: string;
  current?: { version: number; draftRevision: number };
}

export function mapBrandingError(e: unknown): BrandingErrorMapping {
  const err = e as { message?: string; code?: string; current?: { version: number; draftRevision: number } };
  const msg = (typeof err?.message === 'string' ? err.message : String(e)) || '';
  const code = typeof err?.code === 'string' ? err.code : '';
  // Service errors carry both a typed `code` and a `code: detail` message;
  // match either so detail suffixes never fall through to 500.
  const known = (expected: string): boolean => code === expected || msg === expected || msg.startsWith(`${expected}:`);
  if (known('branding-conflict') || msg === 'publish-conflict') {
    return { status: 409, code: 'branding-conflict', detail: msg, current: err?.current };
  }
  if (msg === 'unauthorized') return { status: 403, code: 'forbidden' };
  if (known('branding-not-found')) return { status: 404, code: 'branding-not-found' };
  if (known('history-not-found')) return { status: 404, code: 'history-not-found' };
  if (known('branding-face-not-found')) return { status: 404, code: 'branding-face-not-found', detail: msg };
  if (known('preview-expired')) return { status: 404, code: 'preview-expired' };
  if (known('preview-not-found')) return { status: 404, code: 'preview-not-found' };
  if (known('typeface-not-found')) {
    return { status: 500, code: 'typeface-not-found', detail: msg };
  }
  if (known('typeface-corrupt') || known('typeface-storage-failed')) {
    return { status: 500, code: code || 'typeface-storage-failed', detail: msg };
  }
  if (known('typeface-face-too-large') || known('typeface-family-too-large')) {
    return { status: 413, code: code || 'typeface-face-too-large', detail: msg };
  }
  if (
    known('typeface-invalid-font') ||
    known('typeface-variable-font') ||
    known('typeface-invalid-slot') ||
    known('typeface-empty')
  ) {
    return { status: 400, code: code || 'typeface-invalid-font', detail: msg };
  }
  if (known('branding-invalid')) {
    return { status: 400, code: 'branding-invalid', detail: msg };
  }
  if (msg.startsWith('Invalid variable key') || msg.startsWith('Invalid variable value')) {
    return { status: 400, code: 'invalid-variable', detail: msg };
  }
  if (msg.startsWith('contrast-violation')) return { status: 400, code: 'contrast', detail: msg };
  if (msg.startsWith('logo-invalid')) return { status: 400, code: 'logo-invalid', detail: msg };
  if (msg.startsWith('favicon-invalid')) return { status: 400, code: 'favicon-invalid', detail: msg };
  return { status: 500, code: 'server-error', detail: msg };
}

export interface SkipperUploadedFile {
  fd: string;
  filename?: string;
  type?: string;
  size?: number;
}

/** Retain every reported temporary file so the caller's finally can remove it, even on upload errors. */
export async function receiveSingleFile(
  req: Sails.Req,
  field: string,
  maxBytes: number,
  files: SkipperUploadedFile[]
): Promise<void> {
  const reqObj = req as globalThis.Record<string, unknown>;
  if (!(reqObj._fileparser && typeof reqObj.file === 'function')) return;
  const fileFn = reqObj.file as (name: string) => {
    upload: (options: Record<string, unknown>, cb: (err: unknown, uploaded?: SkipperUploadedFile[]) => void) => void;
  };
  await new Promise<void>((resolve, reject) => {
    fileFn.call(req, field).upload({ maxBytes }, (err, uploaded) => {
      files.push(...(uploaded ?? []));
      if (err) reject(err);
      else resolve();
    });
  });
}

export function isUploadSizeError(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error).toLowerCase();
  return (
    message.includes('maxbytes') ||
    message.includes('exceed') ||
    message.includes('too large') ||
    message.includes('e_exceeds')
  );
}
