// Hook-local audit labels and optional injected audit operations.
// Missing audit support remains non-blocking for PDF generation.

import type { IntegrationAuditAction, IntegrationAuditName } from '@researchdatabox/redbox-core/extensions/storage';

// Hook-local labels — the source of truth for PDF audit identifiers. Other
// hooks should follow the same `*Audit.ts` template; there is no central
// registration step.
export const PdfIntegrationAuditName = 'pdf' as const;

export const PdfIntegrationAuditAction = {
  generatePdf: 'generatePdf', // emitted per attempt
  generatePdfTrigger: 'generatePdfTrigger', // parent span linking attempts
} as const;
export type PdfIntegrationAuditAction = (typeof PdfIntegrationAuditAction)[keyof typeof PdfIntegrationAuditAction];

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

export type IntegrationAuditServiceShape = {
  startAudit: (oid: string, action: IntegrationAuditActionLike, opts?: StartAuditOpts) => IntegrationAuditContext;
  completeAudit: (ctx: IntegrationAuditContext | null | undefined, result?: Record<string, unknown>) => void;
  failAudit: (
    ctx: IntegrationAuditContext | null | undefined,
    error: unknown,
    details?: Record<string, unknown>
  ) => void;
};

export function createPdfAudit(service?: IntegrationAuditServiceShape) {
  function getAuditService(): IntegrationAuditServiceShape | undefined {
    return service;
  }

  /**
   * Starts an audit span for a PDF action. Returns `null` if the injected
   * `IntegrationAuditService` has not been wired up, or if the audit service
   * itself fails, so PDF generation remains non-blocking.
   */
  function startPdfAudit(
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

  function completePdfAudit(ctx: IntegrationAuditContext | null | undefined, details: Record<string, unknown>): void {
    const service = getAuditService();
    if (typeof service?.completeAudit === 'function') {
      try {
        service.completeAudit(ctx, details);
      } catch {
        // Audit failures must never turn a successful PDF generation into an error.
      }
    }
  }

  function failPdfAudit(
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

  return { startPdfAudit, completePdfAudit, failPdfAudit };
}
