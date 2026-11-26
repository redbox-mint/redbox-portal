import { createHmac, randomBytes } from 'node:crypto';
import type { RecordModel } from '../model/storage/RecordModel';

export class FormSaveConflict extends Error {}

function sign(req: Sails.Req, value: unknown): string {
  // The session store shares this key across workers and it is never sent to the browser.
  const key = req.session.formSaveKey ??= randomBytes(32).toString('hex');
  return createHmac('sha256', key).update(JSON.stringify(value)).digest('base64url');
}

function namedEditFormGrant(req: Sails.Req, record: RecordModel, formName: string): string {
  return sign(req, ['form', record.redboxOid, record.metaMetadata.brandId, record.metaMetadata.type, record.metaMetadata.form,
    record.workflow?.stage, req.user?.['username'], formName]);
}

export function authorizeNamedEditForm(req: Sails.Req, record: RecordModel, formName: string): void {
  const grant = namedEditFormGrant(req, record, formName);
  const grants = (req.session.namedEditForms ?? []).filter(value => value !== grant);
  req.session.namedEditForms = [...grants.slice(-19), grant];
}

export function verifyNamedEditForm(req: Sails.Req, record: RecordModel, formName: string): void {
  if (!formName || formName === record.metaMetadata.form) {
    return;
  }
  if (!req.session.namedEditForms?.includes(namedEditFormGrant(req, record, formName))) {
    throw new FormSaveConflict('The edit form has changed. Reload the form before saving.');
  }
}

function canonicalRows(rows: unknown[]): string {
  // Ignore property order differences introduced while storing and hydrating object rows.
  return JSON.stringify(rows, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const object = value as Record<string, unknown>;
      return Object.fromEntries(Object.keys(object).sort().map(key => [key, object[key]]));
    }
    return value;
  });
}

export function formRowRevision(req: Sails.Req, record: RecordModel, path: (string | number)[], rows: unknown[]): string {
  return sign(req, ['rows', record.redboxOid, record.metaMetadata.brandId, path, canonicalRows(rows)]);
}

export function formAttachmentRevision(req: Sails.Req, record: RecordModel, field: string, value: unknown): string {
  const rows = Array.isArray(value) ? value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const row = item as Record<string, unknown>;
    if (typeof row.fileId !== 'string') return row;

    // Sign the same upload URLs and pending flag before and after the save binds the OID.
    const normalized = { ...row };
    for (const key of ['location', 'uploadUrl']) {
      const url = row[key];
      if (typeof url === 'string') {
        normalized[key] = url.replaceAll('pending-oid', () => record.redboxOid);
      }
    }
    if (normalized.pending === true) normalized.pending = false;
    return normalized;
  }) : [];
  return sign(req, ['attachments', record.redboxOid, record.metaMetadata.brandId, field, canonicalRows(rows)]);
}

export function formRowRevisions(req: Sails.Req, record: RecordModel, metadata: Record<string, unknown>, attachmentFields: string[] = []): string[] {
  const revisions = attachmentFields.map(field => formAttachmentRevision(req, record, field, metadata?.[field]));
  function collect(value: unknown, path: (string | number)[]) {
    if (Array.isArray(value)) {
      revisions.push(formRowRevision(req, record, path, value));
      value.forEach((row, index) => collect(row, [...path, index]));
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        collect(child, [...path, key]);
      }
    }
  }
  collect(metadata, []);
  return revisions;
}
