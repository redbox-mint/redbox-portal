import { emailTemplateContextKind } from '../utilities/EmailTemplateContextKind';
import { emailSchemaTargets, emailContextSchema } from '../utilities/EmailContextSchema';
import { lintEmailTemplateSchema } from '../utilities/EmailTemplateSchemaLint';
import type { EmailTemplateAsts } from '../services/EmailTemplateService';
import { EMAIL_PREVIEW_CSP, issueEmailPreviewFrame, readEmailPreviewFrame } from '../utilities/EmailPreviewFrame';
import type { FormRecordAccessContext } from '../services/FormsService';
import type { UserModel } from '../model';
import { Controllers as controllers } from '../CoreController';
import type {
  EmailAdminContent,
  EmailAdminErrorResponse,
  EmailAdminToken,
  EmailAdminActor,
  EmailContextSchemaResponse,
} from '@researchdatabox/sails-ng-common';
import { EmailTemplateConflictError, EmailTemplateError } from '../services/EmailTemplateService';
import { getRouteParam } from '../utilities/RequestParamUtils';
import { requireEmailTemplateAdmin } from '../policies/emailTemplateAdmin';

export function mapEmailTemplateAdminError(error: unknown): { status: number; body: EmailAdminErrorResponse } {
  const code = error instanceof EmailTemplateError ? error.code : 'PERSISTENCE';
  const status =
    code === 'FORBIDDEN' || code === 'UNKNOWN_BRAND'
      ? 403
      : ['UNKNOWN_TEMPLATE', 'UNKNOWN_VERSION', 'MISSING_DEFAULT', 'UNKNOWN_RECORD_TYPE', 'PREVIEW_FRAME_UNAVAILABLE'].includes(code)
        ? 404
        : code === 'REVISION_CONFLICT'
          ? 409
          : code === 'LENGTH_LIMIT'
            ? 413
            : ['PERSISTENCE', 'SANITISATION_FAILED'].includes(code)
              ? 500
              : 400;
  const messages: Record<string, string> = {
    FORBIDDEN: 'Access denied or preview record unavailable.',
    UNKNOWN_BRAND: 'Access denied.',
    UNKNOWN_TEMPLATE: 'Unknown email template.',
    UNKNOWN_RECORD_TYPE: 'Unknown record type.',
    INVALID_SCHEMA_TARGET: 'Invalid record type or workflow stage.',
    PREVIEW_FRAME_UNAVAILABLE: 'Preview expired; render the preview again.',
    UNKNOWN_VERSION: 'Unknown email history version.',
    MISSING_DEFAULT: 'Supplied email default is unavailable.',
    REVISION_CONFLICT: 'The template changed; reload before editing.',
    LENGTH_LIMIT: 'The request exceeds an email size limit.',
    INVALID_CONTEXT: 'Preview context or search parameters are invalid.',
    INVALID_TEMPLATE:
      'Invalid template content or request parameters. Reset history cannot be restored; use the supplied default.',
    RENDER_FAILED: 'The template could not be rendered with this context.',
    SANITISATION_FAILED: 'Email HTML sanitisation is unavailable.',
    PERSISTENCE: 'Email template storage is unavailable.',
    INCOMPLETE_TRANSITION: 'This history version was not applied to the live template.',
  };
  return {
    status,
    body: {
      error: { code, message: messages[code] ?? 'Email template operation failed.' },
      diagnostics: error instanceof EmailTemplateError && error.diagnostic ? [{ code, severity: 'error', ...error.diagnostic }] : [],
      ...(error instanceof EmailTemplateConflictError && error.current ? { current: error.current } : {}),
    },
  };
}

export namespace Controllers {
  export class EmailTemplateAdmin extends controllers.Core.Controller {
    protected override _exportedMethods = [
      'page',
      'schemaTargets',
      'contextSchema',
      'previewFrame',
      'catalogue',
      'editor',
      'saveDraft',
      'discardDraft',
      'fromDefault',
      'validate',
      'preview',
      'searchRecords',
      'recordContext',
      'publish',
      'reset',
      'history',
      'historyVersion',
      'restore',
    ];

    private actor(req: Sails.Req): EmailAdminActor {
      const user = req.user as Record<string, unknown>;
      const name = user.name;
      const displayName =
        typeof user.displayName === 'string'
          ? user.displayName
          : typeof name === 'string'
            ? name
            : name && typeof name === 'object'
              ? [Reflect.get(name, 'givenName'), Reflect.get(name, 'familyName')]
                  .filter(value => typeof value === 'string')
                  .join(' ')
              : typeof user.username === 'string'
                ? user.username
                : '';
      return { id: String(user.id ?? ''), name: displayName };
    }

    private body(req: Sails.Req): Record<string, unknown> {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        throw new EmailTemplateError('INVALID_TEMPLATE', 'A JSON request object is required.');
      }
      return req.body as Record<string, unknown>;
    }

    private async run(
      req: Sails.Req,
      res: Sails.Res,
      action: (brandId: string, templateId: string) => Promise<unknown> | unknown
    ) {
      res.set({ ...this.getNoCacheHeaders(), 'Cache-Control': 'no-store' });
      try {
        const brand = requireEmailTemplateAdmin(req);
        const result = await action(String(brand.id), getRouteParam(req, 'templateId'));
        // Explicit raw JSON keeps the Angular contract independent of X-Source / API-version wrappers.
        if (result === res || res.headersSent) return result;
        return res.status(200).json(result);
      } catch (error) {
        const mapped = mapEmailTemplateAdminError(error);
        // Never log the original exception, request body, rendered output, or arbitrary error messages.
        this.updateChronicle(req, { emailTemplateAdminErrorCode: mapped.body.error.code });
        return res.status(mapped.status).json(mapped.body);
      }
    }

    public page(req: Sails.Req, res: Sails.Res) {
      res.set({ ...this.getNoCacheHeaders(), 'Cache-Control': 'no-store' });
      try {
        requireEmailTemplateAdmin(req);
        return this.sendView(req, res, 'admin/email-templates', { title: 'Email templates' });
      } catch (error) {
        const mapped = mapEmailTemplateAdminError(error);
        return res.status(mapped.status).json(mapped.body);
      }
    }
    private schema(req: Sails.Req, recordType: unknown, stage?: unknown, templateId?: unknown) {
      const brand = requireEmailTemplateAdmin(req);
      return emailContextSchema(brand, getRouteParam(req, 'portal'),
        { brand, user: req.user } as unknown as FormRecordAccessContext, recordType, stage, templateId);
    }
    public schemaTargets(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, () => {
        const brand = requireEmailTemplateAdmin(req);
        return emailSchemaTargets(brand, { brand, user: req.user } as unknown as FormRecordAccessContext);
      });
    }
    public contextSchema(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, () => this.schema(req, req.query.recordType, req.query.stage, req.query.templateId));
    }
    public previewFrame(req: Sails.Req, res: Sails.Res) {
      // Set on success AND failures. set() replaces rather than appends global CSP.
      res.set({ 'Content-Security-Policy': EMAIL_PREVIEW_CSP, 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
      res.removeHeader('Content-Security-Policy-Report-Only');
      return this.run(req, res, brand => {
        const html = readEmailPreviewFrame(getRouteParam(req, 'token'), brand, this.actor(req).id, req.sessionID);
        return res.status(200).type('html').send(html);
      });
    }
    public catalogue(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, async brand => ({ templates: await EmailTemplateAdminService.catalogue(brand) }));
    }
    public editor(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, id) => EmailTemplateAdminService.getEditorState(brand, id));
    }
    public saveDraft(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, id) => {
        const body = this.body(req);
        return EmailTemplateAdminService.saveDraft(
          brand,
          id,
          body.content as EmailAdminContent,
          body.expectedDraftRevision as number | null,
          this.actor(req)
        );
      });
    }
    public discardDraft(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, id) =>
        EmailTemplateAdminService.discardDraft(brand, id, this.body(req).expectedDraftRevision as number)
      );
    }
    public fromDefault(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, id) =>
        EmailTemplateAdminService.startDraftFromDefault(
          brand,
          id,
          this.body(req).expectedDraftRevision as number | null,
          this.actor(req)
        )
      );
    }
    public validate(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, async (brand, id) => {
        // Verify route scope/ID even though validation itself is independent of storage.
        await EmailTemplateService.getDefault(brand, id);
        const body = this.body(req);
        const content = body.content as EmailAdminContent;
        const parsed: EmailTemplateAsts = {};
        const diagnostics = EmailTemplateAdminService.validate(content, parsed);
        const integration = await emailTemplateContextKind(brand, id) === 'integration';
        let context: EmailContextSchemaResponse | undefined;
        if (
          (body.recordType !== undefined || body.stage !== undefined || integration) &&
          diagnostics.every(
            item => item.severity === 'warning' || (integration && item.reason === 'UNKNOWN_CONTEXT_ROOT')
          )
        ) {
          try {
            context = await this.schema(req, body.recordType, body.stage, id);
          } catch {
            // Guidance is advisory: a revoked selection must not prevent structural validation.
            // Discovery still reports the error, and no alternate schema/form is used here.
          }
        }
        // Keep the root allowlist blocking, but offer the integration schema's safe spelling suggestion.
        if (integration && context && diagnostics.some(item => item.reason === 'UNKNOWN_CONTEXT_ROOT') &&
          diagnostics.every(item => item.severity === 'warning' || item.reason === 'UNKNOWN_CONTEXT_ROOT')) {
          const hints = lintEmailTemplateSchema(content, context.schema, true, context.precision, parsed);
          for (let index = 0; index < diagnostics.length; index++) {
            const error = diagnostics[index];
            const hint = hints.find(item => item.code === 'UNKNOWN_FIELD' && item.field === error.field &&
              item.line === error.line && item.column === error.column);
            if (error.reason === 'UNKNOWN_CONTEXT_ROOT' && hint) diagnostics[index] = { ...hint, severity: 'error' };
          }
        }
        if (diagnostics.some(item => item.severity !== 'warning'))
          return res
            .status(400)
            .json({ error: { code: 'INVALID_TEMPLATE', message: 'Template validation failed.' }, diagnostics });
        if (context) {
          diagnostics.push(...lintEmailTemplateSchema(content, context.schema, context.precision === 'integration', context.precision, parsed));
        }
        return { diagnostics };
      });
    }
    public preview(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, async (brand, id) => {
        const body = this.body(req);
        const result = await EmailTemplateAdminService.preview(
          brand,
          id,
          body.content as EmailAdminContent,
          body.context as string,
          body.source as 'default' | 'override' | undefined
        );
        if (result.diagnostics.length)
          return res
            .status(400)
            .json({
              error: { code: result.diagnostics[0].code, message: 'Template preview failed.' },
              diagnostics: result.diagnostics,
            });
        if (typeof result.html === 'string') {
          const token = issueEmailPreviewFrame(brand, this.actor(req).id, req.sessionID, result.html);
          const root = String(sails.config.http?.rootContext ?? '').replace(/^\/+|\/+$/g, '');
          result.frameUrl = '/' + [...root.split('/'), getRouteParam(req, 'branding'), getRouteParam(req, 'portal')].filter(Boolean).map(encodeURIComponent).join('/') + '/app/email-templates/preview-frame/' + token;
        }
        return result;
      });
    }
    public searchRecords(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, brand =>
        EmailTemplateAdminService.searchPreviewRecords(
          brand,
          req.user as unknown as UserModel,
          (req.query.q ?? '') as string,
          req.query.page === undefined ? 1 : Number(req.query.page)
        )
      );
    }
    public recordContext(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, brand =>
        EmailTemplateAdminService.previewContextFromRecord(
          brand,
          getRouteParam(req, 'oid'),
          req.user as unknown as UserModel,
          typeof req.query.templateId === 'string' ? req.query.templateId : undefined
        )
      );
    }
    public publish(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, id) => {
        const body = this.body(req);
        return EmailTemplateAdminService.publish(
          brand,
          id,
          body.expectedDraftRevision as number,
          body.expectedLiveToken as EmailAdminToken | null,
          this.actor(req)
        );
      });
    }
    public reset(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, id) =>
        EmailTemplateAdminService.resetToDefault(
          brand,
          id,
          this.body(req).expectedLiveToken as EmailAdminToken,
          this.actor(req)
        )
      );
    }
    public history(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, async (brand, id) => ({
        versions: await EmailTemplateAdminService.listHistory(brand, id),
      }));
    }
    public historyVersion(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, id) =>
        EmailTemplateAdminService.getHistoryVersion(brand, id, Number(getRouteParam(req, 'version')))
      );
    }
    public restore(req: Sails.Req, res: Sails.Res) {
      return this.run(req, res, (brand, id) =>
        EmailTemplateAdminService.restoreToDraft(
          brand,
          id,
          Number(getRouteParam(req, 'version')),
          this.body(req).expectedDraftRevision as number | null,
          this.actor(req)
        )
      );
    }
  }
}
