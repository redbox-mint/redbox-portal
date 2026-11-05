import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import csv = require('csv-parser');
import { firstValueFrom } from 'rxjs';
import { Services as services } from '../CoreService';
import { createRecordSaveContext } from '../RecordSaveResponse';
import type { BrandingModel } from '../model/storage/BrandingModel';
import { partyImportInput, partyMapping } from '../api-routes/groups/party-import';

export const PARTY_CSV_MAX_BYTES = 2 * 1024 * 1024;
export const PARTY_CSV_MAX_ROWS = 5000;
export const PARTY_FIELDS = ['fullName', 'givenName', 'surname', 'email', 'orcid'] as const;
export type PartyMapping = Partial<Record<typeof PARTY_FIELDS[number], number>>;
export type PartyImportRow = { row: number; metadata: Record<string, string>; reasons: string[]; status: string; oid?: string };
export class PartyImportError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

/** Parse into positional cells: untrusted CSV headers never become object keys. */
export async function parsePartyCsv(content: string): Promise<{ headers: string[]; rows: string[][] }> {
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > PARTY_CSV_MAX_BYTES) throw new PartyImportError(413, 'size-limit');
  if (content.includes('\0') || content.includes('\uFFFD')) throw new PartyImportError(400, 'invalid-csv');
  const parser = csv({ headers: false, maxRowBytes: 64 * 1024 });
  const parsed: string[][] = [];
  try {
    for await (const row of Readable.from([content.replace(/^\uFEFF/, '')]).pipe(parser)) {
      const cells = Object.values(row) as string[];
      if (cells.length > 50 || parsed.length > PARTY_CSV_MAX_ROWS) throw new PartyImportError(413, 'row-limit');
      parsed.push(cells);
    }
    // csv-parser accepts an unfinished final quoted cell; fail closed on it.
    if ((parser as unknown as { state: { quoted: boolean } }).state.quoted) throw new PartyImportError(400, 'invalid-csv');
  } catch (error) {
    if (error instanceof PartyImportError) throw error;
    throw new PartyImportError(400, 'invalid-csv');
  }
  const headers = parsed.shift();
  if (!headers?.length || !parsed.length || headers.some(value => !value.trim() || value.length > 200) || parsed.some(row => row.length !== headers.length)) {
    throw new PartyImportError(400, 'invalid-csv');
  }
  return { headers, rows: parsed };
}
export function partyImportHash(input: unknown, brandId: string, userId: string): string {
  return createHash('sha256').update(JSON.stringify([brandId, userId, partyImportInput.parse(input)])).digest('hex');
}
export function mapPartyRows(rows: string[][], mappingInput: unknown): PartyImportRow[] {
  const parsed = partyMapping.safeParse(mappingInput);
  if (!parsed.success) throw new PartyImportError(400, 'invalid-mapping');
  const mapping = parsed.data;
  const used = Object.values(mapping);
  if (new Set(used).size !== used.length || used.some(index => rows.some(row => index >= row.length))) throw new PartyImportError(400, 'invalid-mapping');
  const emails = new Set<string>();
  return rows.map((cells, index) => {
    const metadata: Record<string, string> = {};
    const reasons: string[] = [];
    for (const field of PARTY_FIELDS) {
      if (mapping[field] === undefined) continue;
      const raw = cells[mapping[field]!];
      const value = raw.trim();
      if (value.length > 500 || /[\u0000-\u001f\u007f<>]/.test(raw) || /^\s*[=+\-@]/.test(raw)) reasons.push('unsafe-value');
      metadata[field] = value;
    }
    if (metadata.fullName && !metadata.givenName && !metadata.surname) {
      // The party onCreate hook derives fullName from these fields. Preserve a
      // one-column name without guessing how a person's name should be split.
      metadata.givenName = metadata.fullName;
    }
    metadata.fullName = [metadata.givenName, metadata.surname].filter(Boolean).join(' ') || metadata.fullName || '';
    if (!metadata.fullName) reasons.push('name-required');
    const email = (metadata.email || '').toLowerCase();
    metadata.email = email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reasons.push('invalid-email');
    if (metadata.orcid && !/^(https:\/\/orcid\.org\/)?\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(metadata.orcid)) reasons.push('invalid-orcid');
    if (email && emails.has(email)) reasons.push('duplicate-file');
    if (email) emails.add(email);
    return { row: index + 2, metadata, reasons: [...new Set(reasons)], status: reasons.length ? 'invalid' : 'valid' };
  });
}

export namespace Services {
  export class PartyImport extends services.Core.Service {
    protected override _exportedMethods = ['inspect', 'preview', 'apply'];
    public async inspect(content: string) {
      const parsed = await parsePartyCsv(content);
      return { headers: parsed.headers, sample: parsed.rows.slice(0, 5), total: parsed.rows.length, fields: PARTY_FIELDS };
    }
    private async duplicate(email: string, brand: BrandingModel, user: Record<string, unknown>): Promise<boolean> {
      const response = await RecordsService.getRecords('', 'party', 0, 5001, user.username, (user.roles ?? []) as Record<string, unknown>[], brand,
        undefined, undefined, undefined, ['metadata.email'], email, 'regex');
      if (!response.isSuccessful()) throw new PartyImportError(503, 'duplicate-check-failed');
      // A saturated result is conservatively a likely duplicate as well.
      return response.totalItems > 5000 || response.items.some(item =>
        String((item as { metadata?: { email?: string } }).metadata?.email ?? '').trim().toLowerCase() === email);
    }
    public async preview(content: string, mapping: unknown, brand: BrandingModel, user: Record<string, unknown>) {
      const parsed = await parsePartyCsv(content);
      const rows = mapPartyRows(parsed.rows, mapping);
      const checked = new Map<string, boolean>();
      for (const row of rows) {
        if (!row.reasons.includes('invalid-email')) {
          const email = row.metadata.email;
          if (!checked.has(email)) checked.set(email, await this.duplicate(email, brand, user));
          if (checked.get(email)) row.reasons.push('duplicate-existing');
        }
        row.status = row.reasons.length ? 'invalid' : 'valid';
      }
      return { headers: parsed.headers, rows, valid: rows.filter(row => row.status === 'valid').length, invalid: rows.filter(row => row.status === 'invalid').length };
    }
    public async apply(content: string, mapping: unknown, brand: BrandingModel, user: Record<string, unknown>) {
      const preview = await this.preview(content, mapping, brand, user);
      const type = await firstValueFrom(RecordTypesService.get(brand, 'party'));
      for (const row of preview.rows) {
        if (row.status !== 'valid') { row.status = 'skipped'; continue; }
        try {
          // Recheck immediately before every write, including earlier rows in this batch.
          if (await this.duplicate(row.metadata.email, brand, user)) { row.status = 'skipped'; row.reasons.push('duplicate-existing'); continue; }
          const response = await RecordsService.create(brand, {
            metaMetadata: {}, metadata: row.metadata,
            authorization: { view: [user.username], edit: [user.username] },
          }, type, user, true, true, null, createRecordSaveContext({
            operation: 'create', routeFamily: 'browser', validationRequestParameters: { recordType: 'party' },
          }));
          row.status = response.wasPersisted() ? response.outcome : response.outcome === 'unknown' ? 'unknown' : 'failed';
          if (response.wasPersisted()) row.oid = response.oid;
          row.reasons = [...new Set(response.problems.map(problem => problem.kind === 'validation' ? 'record-validation-failed' : 'creation-failed'))];
        } catch {
          // A thrown downstream failure can follow persistence. Never retry automatically.
          row.status = 'unknown'; row.reasons = ['creation-unknown'];
        }
      }
      return { rows: preview.rows };
    }
  }
}
declare global { const PartyImportService: ReturnType<Services.PartyImport['exports']> & Services.PartyImport; }
