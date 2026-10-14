// Integration Audit helpers for the PDF generation hook.
//
// This module mirrors the shape of redbox-core's `services/doi-v2/audit.ts`
// helper, but it owns its own integration name & action labels so that the
// hook can ship new audit categories without modifying core enums. The
// `IntegrationAuditService` global is injected by Sails at runtime — the
// helpers below are no-ops when it is absent so PDF generation continues to
// work in environments where the audit hook is not loaded.
//
// The local `IntegrationAuditActionLike` / `IntegrationAuditNameLike` /
// `IntegrationAuditContext` types are duplicated here because the published
// `@researchdatabox/redbox-core` peer-dep does not currently re-export them
// through the package barrel. Once the peer dep is bumped to a version that
// surfaces them, the locals can be replaced with imports.

import { IntegrationAuditAction, IntegrationAuditName } from '@researchdatabox/redbox-core';

// Hook-local labels — the source of truth for PDF audit identifiers. Other
// hooks should follow the same `*Audit.ts` template; there is no central
// registration step.
export const PdfIntegrationAuditName = 'pdf' as const;

export const PdfIntegrationAuditAction = {
  generatePdf: 'generatePdf',                 // emitted per attempt
  generatePdfTrigger: 'generatePdfTrigger',   // parent span linking attempts
} as const;
export type PdfIntegrationAuditAction =
  typeof PdfIntegrationAuditAction[keyof typeof PdfIntegrationAuditAction];

// Widened type aliases that accept either the core-shipped enum values or
// arbitrary strings supplied by hooks (the `string & {}` intersection
// preserves enum autocomplete while still accepting any string).
export type IntegrationAuditActionLike = IntegrationAuditAction | (string & {});
export type IntegrationAuditNameLike = IntegrationAuditName | (string & {});

// Mirrors `IntegrationAuditContext` from redbox-core's IntegrationAuditService.
export type IntegrationAuditContext = {
  redboxOid: string;
  brandId?: string;
  integrationName: IntegrationAuditNameLike;
  integrationAction: IntegrationAuditActionLike;
  triggeredBy?: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startedAt: string;
  requestSummary?: Record<string, unknown>;
};

type StartAuditOpts = {
  brandId?: string;
  integrationName?: IntegrationAuditNameLike;
  triggeredBy?: string;
  requestSummary?: Record<string, unknown>;
  message?: string;
  httpStatusCode?: number;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
};

type IntegrationAuditServiceShape = {
  startAudit: (
    oid: string,
    action: IntegrationAuditActionLike,
    opts?: StartAuditOpts
  ) => IntegrationAuditContext;
  completeAudit: (ctx: IntegrationAuditContext | null | undefined, result?: Record<string, unknown>) => void;
  failAudit: (ctx: IntegrationAuditContext | null | undefined, error: unknown, details?: Record<string, unknown>) => void;
};

/**
 * Resolves the global `IntegrationAuditService` via `globalThis` so that the
 * absence of the binding (e.g., in unit tests where Sails isn't fully booted)
 * surfaces as `undefined` rather than a `ReferenceError`. Sails injects the
 * service onto the global namespace at runtime; accessing it through
 * `globalThis` keeps the typeof guard safe across all environments.
 */
function getAuditService(): IntegrationAuditServiceShape | undefined {
  const candidate = (globalThis as { IntegrationAuditService?: IntegrationAuditServiceShape }).IntegrationAuditService;
  if (candidate == null || typeof candidate !== 'object') {
    return undefined;
  }
  return candidate;
}

/**
 * Starts an audit span for a PDF action. Returns `null` if the global
 * `IntegrationAuditService` has not been wired up, or if the audit service
 * itself fails, so PDF generation remains non-blocking.
 */
export function startPdfAudit(
  oid: string,
  action: IntegrationAuditActionLike,
  opts: StartAuditOpts = {},
  parentAuditCtx?: IntegrationAuditContext | null
): IntegrationAuditContext | null {
  const service = getAuditService();
  if (typeof service?.startAudit !== 'function') {
    return null;
  }
  const mergedOpts: StartAuditOpts = {
    integrationName: PdfIntegrationAuditName,
    ...opts,
  };
  if (parentAuditCtx != null) {
    mergedOpts.traceId = mergedOpts.traceId ?? parentAuditCtx.traceId;
    mergedOpts.parentSpanId = mergedOpts.parentSpanId ?? parentAuditCtx.spanId;
  }
  try {
    return service.startAudit(oid, action, mergedOpts);
  } catch {
    return null;
  }
}

export function completePdfAudit(
  ctx: IntegrationAuditContext | null | undefined,
  details: Record<string, unknown>
): void {
  const service = getAuditService();
  if (typeof service?.completeAudit === 'function') {
    try {
      service.completeAudit(ctx, details);
    } catch {
      // Audit failures must never turn a successful PDF generation into an error.
    }
  }
}

export function failPdfAudit(
  ctx: IntegrationAuditContext | null | undefined,
  error: unknown,
  details: Record<string, unknown>
): void {
  const service = getAuditService();
  if (typeof service?.failAudit === 'function') {
    try {
      service.failAudit(ctx, error, details);
    } catch {
      // The original PDF error is the one callers should observe.
    }
  }
}
