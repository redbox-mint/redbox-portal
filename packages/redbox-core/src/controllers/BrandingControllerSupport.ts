export * from '../branding/HttpErrors';
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
