import type { EmailAdminContent, EmailAdminCurrent, EmailAdminDiagnostic } from '@researchdatabox/sails-ng-common';

export type {
  EmailAdminCatalogueEntry,
  EmailAdminContent,
  EmailAdminCurrent,
  EmailAdminDiagnostic,
  EmailAdminDraft,
  EmailAdminEditorState,
  EmailAdminHistory,
  EmailAdminPreview,
  EmailAdminRecordSearch,
  EmailAdminToken,
} from '@researchdatabox/sails-ng-common';

export type EmailTemplateFormat = EmailAdminContent['format'];

/** A preview record as returned by the search endpoint. */
export interface EmailPreviewRecord {
  oid: string;
  title: string;
}

/**
 * Normalised API failure. Every non-2xx response becomes one of these so
 * components never inspect raw HttpErrorResponse shapes.
 */
export class EmailTemplateApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly diagnostics: EmailAdminDiagnostic[] = [],
    public readonly current?: EmailAdminCurrent
  ) {
    super(code);
    this.name = 'EmailTemplateApiError';
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

export function isApiError(error: unknown): error is EmailTemplateApiError {
  return error instanceof EmailTemplateApiError;
}

export function sameContent(a: EmailAdminContent | null | undefined, b: EmailAdminContent | null | undefined): boolean {
  return !!a && !!b && a.subject === b.subject && a.body === b.body && a.format === b.format;
}

export function copyContent(content: EmailAdminContent): EmailAdminContent {
  return { subject: content.subject, body: content.body, format: content.format };
}

/**
 * Count changed body lines for the publish summary. This is deliberately not a
 * diff: trim the identical leading and trailing lines, then count the larger
 * remaining side, so one inserted line reads as one change rather than every
 * line after it.
 */
export function changedLineCount(before: string, after: string): number {
  if (before === after) {
    return 0;
  }
  const a = before.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  return Math.max(endA - start + 1, endB - start + 1);
}

/**
 * Diagnostics never echo template text, so recover the offending identifier
 * from the local source for a more useful message. Returns null when the
 * position does not point at an identifier.
 */
export function identifierAt(source: string, line: number, column: number): string | null {
  const text = source.split('\n')[line - 1];
  if (text === undefined) {
    return null;
  }
  const match = /^[@A-Za-z_$][\w$.@/-]*/.exec(text.slice(Math.max(0, column - 1)));
  if (!match) {
    return null;
  }
  const path = match[0].replace(/^@root\./, '').replace(/^\.\//, '');
  const head = path.split(/[./]/)[0];
  return head || null;
}

/** UTF-8 byte length, matching the server's Buffer.byteLength checks. */
export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * i18next HTML-escapes interpolated values by default, which would show
 * entities for names like "O'Brien". Angular text bindings already escape, so
 * values bound as text are interpolated raw.
 */
export const RAW_INTERPOLATION = { escapeValue: false } as const;
