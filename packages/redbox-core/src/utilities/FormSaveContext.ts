import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RecordModel } from '../model/storage/RecordModel';

export class FormSaveConflict extends Error {}

function sign(req: Sails.Req, value: unknown): string {
  // The session store shares this key across workers and it is never sent to the browser.
  const key = req.session.formSaveKey ??= randomBytes(32).toString('hex');
  return createHmac('sha256', key).update(JSON.stringify(value)).digest('base64url');
}

export function namedEditFormToken(req: Sails.Req, record: RecordModel, formName: string): string {
  return sign(req, ['form', record.redboxOid, record.metaMetadata.brandId, record.metaMetadata.type, record.metaMetadata.form,
    record.workflow?.stage, req.user?.['username'], formName]);
}

export function verifyNamedEditForm(req: Sails.Req, record: RecordModel, formName: string, token: unknown): void {
  if (!formName || formName === record.metaMetadata.form) {
    return;
  }
  const expected = Buffer.from(namedEditFormToken(req, record, formName));
  const received = typeof token === 'string' ? Buffer.from(token) : Buffer.alloc(0);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new FormSaveConflict('The edit form has changed. Reload the form before saving.');
  }
}

export function formRowRevision(req: Sails.Req, record: RecordModel, metadata: Record<string, unknown>): string {
  const arrays: [path: (string | number)[], value: unknown[]][] = [];
  function collect(value: unknown, path: (string | number)[]) {
    if (Array.isArray(value)) {
      // The entire array, including nested rows, is covered by the revision.
      arrays.push([path, value]);
    } else if (value && typeof value === 'object') {
      for (const key of Object.keys(value).sort()) {
        collect((value as Record<string, unknown>)[key], [...path, key]);
      }
    }
  }
  collect(metadata, []);
  // Ignore property order differences introduced while storing and hydrating object rows.
  const content = JSON.stringify(arrays, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const object = value as Record<string, unknown>;
      return Object.fromEntries(Object.keys(object).sort().map(key => [key, object[key]]));
    }
    return value;
  });
  return sign(req, ['rows', record.redboxOid, record.metaMetadata.brandId, content]);
}
