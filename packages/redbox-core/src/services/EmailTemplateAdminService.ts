import { readdirSync } from 'node:fs';
import { handlebarsInstance } from '@researchdatabox/sails-ng-common';
import type {
  EmailAdminActor,
  EmailAdminCatalogueEntry,
  EmailAdminContent,
  EmailAdminDiagnostic,
  EmailAdminDraft,
  EmailAdminEditorState,
  EmailAdminHistory,
  EmailAdminPreview,
  EmailAdminToken,
  EmailAdminRecordSearch,
} from '@researchdatabox/sails-ng-common';
import {
  Services as TemplateServices,
  EmailTemplateError,
  validateEmailTemplate,
  emailTemplateDefinition,
  emailTemplateContextRoots,
  emailDefaultHash,
  emailAdminSetting,
  hardenEmailSubject,
  validateEmailLength,
} from './EmailTemplateService';
import type { SearchService } from '../SearchService';
import type { EmailTemplateAsts } from './EmailTemplateService';
import type { UserModel, BrandingModel, RoleModel } from '../model';
import { emailTemplateContextKind, integrationEmailTemplateIds } from '../utilities/EmailTemplateContextKind';
import { integrationEmailContextSchema } from '../utilities/EmailContextSchema';
import { curateEmailRecordData, renderEmailAdminPreview } from './EmailService';

type DraftRow = EmailAdminContent & {
  _id?: import('mongodb').ObjectId;
  brandId: string;
  templateId: string;
  draftRevision: number;
  baseVersion: EmailAdminToken | null;
  restoredFromVersion: number | null;
  updatedBy: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
};

/** Strip unapproved roots and recursively copy own JSON properties without prototype keys. */
export function filterEmailPreviewContext(value: unknown, roots = emailTemplateContextRoots()): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EmailTemplateError('INVALID_CONTEXT', 'Preview context must be a JSON object.');
  }
  const blocked = new Set(['__proto__', 'prototype', 'constructor']);
  const clone = (input: unknown, depth: number): unknown => {
    if (depth > 64) throw new EmailTemplateError('INVALID_CONTEXT', 'Preview context exceeds the nesting limit.');
    if (input === null || ['string', 'boolean', 'number', 'undefined'].includes(typeof input)) return input;
    if (
      !Array.isArray(input) &&
      Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null
    ) {
      throw new EmailTemplateError('INVALID_CONTEXT', 'Preview context must contain plain JSON data.');
    }
    const out: Record<string, unknown> | unknown[] = Array.isArray(input) ? [] : Object.create(null);
    for (const name of Object.keys(input as object)) {
      if (blocked.has(name)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(input, name)!;
      if (!Object.hasOwn(descriptor, 'value'))
        throw new EmailTemplateError('INVALID_CONTEXT', 'Preview context cannot contain accessors.');
      Object.defineProperty(out, name, {
        value: clone(descriptor.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  };
  const out: Record<string, unknown> = Object.create(null);
  for (const root of roots) {
    const descriptor = Object.getOwnPropertyDescriptor(value, root);
    if (!descriptor) continue;
    if (!Object.hasOwn(descriptor, 'value'))
      throw new EmailTemplateError('INVALID_CONTEXT', 'Preview context cannot contain accessors.');
    out[root] = clone(descriptor.value, 0);
  }
  return out;
}

export namespace Services {
  export class EmailTemplateAdmin extends TemplateServices.EmailTemplates {
    protected override _exportedMethods = [
      'catalogue',
      'getEditorState',
      'saveDraft',
      'discardDraft',
      'validate',
      'publish',
      'resetToDefault',
      'listHistory',
      'getHistoryVersion',
      'restoreToDraft',
      'startDraftFromDefault',
      'previewContextFromRecord',
      'preview',
      'searchPreviewRecords',
    ];

    private drafts() {
      return this.requireNative().db.collection<DraftRow>(EmailTemplateDraft.tableName);
    }
    private async scope(brandId: string, templateId: string) {
      await this.validateBrand(brandId);
      emailTemplateDefinition(templateId);
    }
    private revision(value: number | null): void {
      if (value !== null && (!Number.isSafeInteger(value) || value < 1)) {
        throw new EmailTemplateError(
          'INVALID_TEMPLATE',
          'expectedDraftRevision must be a positive safe integer or null.'
        );
      }
    }
    private change(
      row: { updatedBy?: string | null; updatedByName?: string | null; updatedAt?: string | null } | null
    ) {
      return {
        updatedBy: row?.updatedBy || null,
        updatedByName: row?.updatedByName || null,
        updatedAt: row?.updatedAt || null,
      };
    }
    private draftDto(row: DraftRow): EmailAdminDraft {
      return {
        subject: row.subject,
        body: row.body,
        format: row.format,
        draftRevision: row.draftRevision,
        baseVersion: row.baseVersion,
        restoredFromVersion: row.restoredFromVersion ?? null,
        ...this.change(row),
      };
    }

    public validate(content: EmailAdminContent, parsed?: EmailTemplateAsts): EmailAdminDiagnostic[] {
      // Structure/byte errors cannot be persisted. Policy and parser errors are editable diagnostics.
      if (
        !content ||
        typeof content.subject !== 'string' ||
        typeof content.body !== 'string' ||
        !['html', 'text'].includes(content.format)
      ) {
        throw new EmailTemplateError('INVALID_TEMPLATE', 'Content requires subject, body, and html or text format.');
      }
      validateEmailLength(content.subject, 'subject');
      validateEmailLength(content.body, 'body');
      const diagnostics: EmailAdminDiagnostic[] = [];
      for (const field of ['subject', 'body'] as const) {
        try {
          const fieldAsts: EmailTemplateAsts = {};
          validateEmailTemplate(
            { subject: 'Valid', body: 'Valid', format: content.format, [field]: content[field] },
            true,
            parsed ? fieldAsts : undefined
          );
          if (parsed) parsed[field] = fieldAsts[field];
        } catch (error) {
          if (!(error instanceof EmailTemplateError)) throw error;
          diagnostics.push({
            code: error.code,
            severity: 'error',
            field,
            reason: error.diagnostic?.reason ?? 'EMPTY_CONTENT',
            ...(error.diagnostic?.helper ? { helper: error.diagnostic.helper } : {}),
            line: error.diagnostic?.line ?? 1,
            column: error.diagnostic?.column ?? 1,
          });
        }
      }
      return diagnostics;
    }

    public async catalogue(brandId: string): Promise<EmailAdminCatalogueEntry[]> {
      await this.validateBrand(brandId);
      const integrationIds = await integrationEmailTemplateIds(brandId);
      const ids = new Set(Object.keys(sails.config.emailnotification.templates ?? {}));
      try {
        for (const file of readdirSync(sails.config.emailnotification.settings.templateDir)) {
          if (/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.hbs$/.test(file)) ids.add(file.slice(0, -4));
        }
      } catch {
        throw new EmailTemplateError('MISSING_DEFAULT', 'Unable to enumerate supplied email templates.');
      }
      const entries: EmailAdminCatalogueEntry[] = [];
      for (const templateId of [...ids].sort()) {
        const live = await this.rawLive(brandId, templateId);
        const draft = await this.persist(() => this.drafts().findOne({ brandId, templateId }));
        const last = await this.latestHistory(brandId, templateId);
        const changes = [
          this.change(draft),
          this.change(live),
          {
            updatedBy: last?.actorId || null,
            updatedByName: last?.actorDisplayName || null,
            updatedAt: last?.createdAt ?? null,
          },
        ].sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''));
        let invalid = false;
        let defaultUpdated = false;
        const definition = emailTemplateDefinition(templateId);
        let subject = definition.subject;
        try {
          const supplied = await this.getDefault(brandId, templateId);
          subject = supplied.subject;
          const hash = live?.defaultHash ?? (last?.version === live?.revision ? last?.defaultHash : undefined);
          defaultUpdated = Boolean(live && hash && hash !== emailDefaultHash(supplied));
          if (live) this.validateStored(live, brandId, templateId);
        } catch (error) {
          if (
            !(error instanceof EmailTemplateError) ||
            !['MISSING_DEFAULT', 'INVALID_TEMPLATE', 'LENGTH_LIMIT'].includes(error.code)
          )
            throw error;
          invalid = true;
        }
        entries.push({
          templateId,
          contextKind: integrationIds.has(templateId) ? 'integration' : 'record',
          description: definition.description,
          subject,
          source: live ? 'override' : 'default',
          liveVersion: live?.revision ?? null,
          latestVersion: await this.latestVersion(brandId, templateId),
          hasDraft: draft !== null,
          draftRevision: draft?.draftRevision ?? null,
          invalid,
          defaultUpdated,
          consistency: (await this.reportInconsistencies(brandId, templateId)).map(({ code, version }) => ({
            code,
            version,
          })),
          ...changes[0],
        });
      }
      return entries;
    }

    public async getEditorState(brandId: string, templateId: string): Promise<EmailAdminEditorState> {
      const supplied = await this.getDefault(brandId, templateId);
      const live = await this.rawLive(brandId, templateId);
      const draft = await this.persist(() => this.drafts().findOne({ brandId, templateId }));
      const last = await this.latestHistory(brandId, templateId);
      const contextKind = await emailTemplateContextKind(brandId, templateId);
      let diagnostics: EmailAdminDiagnostic[] = [];
      if (live) {
        try {
          this.validateStored(live, brandId, templateId);
        } catch (error) {
          if (!(error instanceof EmailTemplateError)) throw error;
          diagnostics = [
            {
              code: error.code,
              field: error.diagnostic?.field ?? 'body',
              reason: error.diagnostic?.reason ?? 'INVALID_STORED_TEMPLATE',
              ...(error.diagnostic?.helper ? { helper: error.diagnostic.helper } : {}),
              line: error.diagnostic?.line ?? 1,
              column: error.diagnostic?.column ?? 1,
            },
          ];
        }
      }
      const hash = live?.defaultHash ?? (last?.version === live?.revision ? last?.defaultHash : undefined);
      return {
        templateId,
        contextKind,
        description: emailTemplateDefinition(templateId).description,
        suppliedDefault: { subject: supplied.subject, body: supplied.body, format: supplied.format },
        live: live
          ? {
              subject: live.subject,
              body: live.body,
              format: live.format,
              token: this.token(live)!,
              defaultHash: hash ?? null,
              ...this.change(live),
            }
          : null,
        draft: draft ? this.draftDto(draft) : null,
        defaultUpdated: Boolean(live && hash && hash !== emailDefaultHash(supplied)),
        invalid: diagnostics.length > 0,
        diagnostics,
        consistency: (await this.reportInconsistencies(brandId, templateId)).map(({ code, version }) => ({
          code,
          version,
        })),
        help: {
          contextRoots: (contextKind === 'integration'
            ? Object.keys(integrationEmailContextSchema(templateId, brandId).properties!)
            : [...emailTemplateContextRoots()]).sort(),
          helpers: Object.keys(handlebarsInstance().helpers).sort(),
          maxSubjectBytes: sails.config.emailnotification.settings.maxSubjectBytes ?? 998,
          maxBodyBytes: sails.config.emailnotification.settings.maxBodyBytes ?? 1048576,
          maxContextBytes: emailAdminSetting('maxPreviewContextBytes'),
        },
        latestVersion: await this.latestVersion(brandId, templateId),
        historyMaxVersions: emailAdminSetting('historyMaxVersions'),
      };
    }

    public async saveDraft(
      brandId: string,
      templateId: string,
      content: EmailAdminContent,
      expectedDraftRevision: number | null,
      actor: EmailAdminActor,
      restoredFromVersion?: number | null
    ) {
      await this.scope(brandId, templateId);
      this.revision(expectedDraftRevision);
      const diagnostics = this.validate(content);
      const existing = await this.persist(() => this.drafts().findOne({ brandId, templateId }));
      if ((existing?.draftRevision ?? null) !== expectedDraftRevision) return this.conflict(brandId, templateId);
      const live = await this.rawLive(brandId, templateId);
      // Durable counter (private native collection, no REST model). Gaps on failed CAS are harmless.
      const counter = await this.persist(() =>
        this.requireNative()
          .db.collection<{ _id: string; revision: number }>('emailtemplatedraftrevision')
          .findOneAndUpdate(
            { _id: JSON.stringify([brandId, templateId]) },
            { $inc: { revision: 1 } },
            { upsert: true, returnDocument: 'after', includeResultMetadata: false }
          )
      );
      if (!counter || !Number.isSafeInteger(counter.revision))
        throw new EmailTemplateError('PERSISTENCE', 'Draft revision counter exhausted.');
      const now = new Date().toISOString();
      const values = {
        subject: content.subject,
        body: content.body,
        format: content.format,
        draftRevision: counter.revision,
        baseVersion: existing ? existing.baseVersion : this.token(live),
        restoredFromVersion:
          restoredFromVersion === undefined ? (existing?.restoredFromVersion ?? null) : restoredFromVersion,
        updatedBy: actor.id,
        updatedByName: actor.name,
        updatedAt: now,
      };
      let row: DraftRow;
      if (expectedDraftRevision === null) {
        const value = { ...values, uid: JSON.stringify([brandId, templateId]), brandId, templateId, createdAt: now };
        await this.persist(async () => {
          try {
            await this.drafts().insertOne(value as DraftRow);
          } catch (error) {
            if ((error as { code?: number }).code === 11000) return this.conflict(brandId, templateId);
            throw error;
          }
        });
        row = value as DraftRow;
      } else {
        const updated = await this.persist(() =>
          this.drafts().findOneAndUpdate(
            { brandId, templateId, draftRevision: expectedDraftRevision },
            { $set: values },
            { returnDocument: 'after', includeResultMetadata: false }
          )
        );
        if (!updated) return this.conflict(brandId, templateId);
        row = updated;
      }
      return { draft: this.draftDto(row), diagnostics };
    }

    public async discardDraft(brandId: string, templateId: string, expectedDraftRevision: number) {
      await this.scope(brandId, templateId);
      this.revision(expectedDraftRevision);
      if (expectedDraftRevision === null)
        throw new EmailTemplateError('INVALID_TEMPLATE', 'A draft revision is required.');
      const removed = await this.persist(() =>
        this.drafts().deleteOne({ brandId, templateId, draftRevision: expectedDraftRevision })
      );
      if (removed.deletedCount !== 1) return this.conflict(brandId, templateId);
      return { discarded: true };
    }

    public async publish(
      brandId: string,
      templateId: string,
      expectedDraftRevision: number,
      expectedLiveToken: EmailAdminToken | null,
      actor: EmailAdminActor
    ) {
      await this.scope(brandId, templateId);
      this.revision(expectedDraftRevision);
      const draft = await this.persist(() => this.drafts().findOne({ brandId, templateId }));
      if (!draft || draft.draftRevision !== expectedDraftRevision) return this.conflict(brandId, templateId);
      await this.commitLive(brandId, templateId, draft, expectedLiveToken, actor, draft);
      let draftRetained = true;
      try {
        const result = await this.persist(() =>
          this.drafts().deleteOne({ brandId, templateId, draftRevision: expectedDraftRevision })
        );
        draftRetained = result.deletedCount !== 1;
      } catch {
        this.updateChronicle({ emailPublishedDraftCleanup: 'failed' }, [], 'warn');
      }
      return { state: await this.getEditorState(brandId, templateId), draftRetained };
    }

    public async resetToDefault(
      brandId: string,
      templateId: string,
      expectedLiveToken: EmailAdminToken,
      actor: EmailAdminActor
    ) {
      if (!expectedLiveToken) throw new EmailTemplateError('INVALID_TEMPLATE', 'A live token is required for reset.');
      await this.commitLive(brandId, templateId, null, expectedLiveToken, actor);
      return { state: await this.getEditorState(brandId, templateId), draftRetained: false };
    }

    public async listHistory(brandId: string, templateId: string): Promise<EmailAdminHistory[]> {
      await this.scope(brandId, templateId);
      const rows = await this.persist(() =>
        this.historyCollection().find({ brandId, templateId }).sort({ version: -1 }).toArray()
      );
      const live = await this.rawLive(brandId, templateId);
      // A pending latest reservation is explicitly marked unapplied and cannot be restored.
      const head = await this.persist(() => this.heads().findOne({ brandId, templateId }));
      const rolledBack = new Set((await this.persist(() => this.reconciliations().find({ brandId, templateId }).toArray()))
        .filter(entry => entry.outcome === 'rolled-back').map(entry => entry.version));
      const pending = rows.find(row => row.version === head?.reservation);
      const latestVersion = pending && !rolledBack.has(pending.version) && this.transitionMatches(live, pending)
        ? pending.version : head?.committedVersion ?? rows[0]?.version;
      return rows.map(row => ({
        version: row.version,
        event: row.event,
        subject: row.subject,
        body: row.body,
        format: row.format,
        restoredFromVersion: row.restoredFromVersion,
        defaultHash: row.defaultHash,
        actorId: row.actorId,
        actorDisplayName: row.actorDisplayName,
        createdAt: row.createdAt,
        live:
          row.event === 'reset'
            ? !live && row.version === latestVersion
            : row.version === live?.revision && row.liveId === String(live.id),
        applied: !rolledBack.has(row.version) && (row.version < (head?.committedVersion ?? rows[0]?.version) ||
          this.transitionMatches(live, row)),
      }));
    }

    public async getHistoryVersion(brandId: string, templateId: string, version: number): Promise<EmailAdminHistory> {
      if (!Number.isSafeInteger(version) || version < 1)
        throw new EmailTemplateError('UNKNOWN_VERSION', 'Unknown email history version.');
      const row = (await this.listHistory(brandId, templateId)).find(entry => entry.version === version);
      if (!row) throw new EmailTemplateError('UNKNOWN_VERSION', 'Unknown email history version.');
      return row;
    }

    public async restoreToDraft(
      brandId: string,
      templateId: string,
      version: number,
      expectedDraftRevision: number | null,
      actor: EmailAdminActor
    ) {
      const row = await this.getHistoryVersion(brandId, templateId, version);
      if (row.event === 'reset')
        throw new EmailTemplateError(
          'INVALID_TEMPLATE',
          'Reset versions cannot be restored; start a draft from the supplied default.'
        );
      if (!row.applied)
        throw new EmailTemplateError(
          'INCOMPLETE_TRANSITION',
          'This history version was not applied to the live template.'
        );
      return this.saveDraft(
        brandId,
        templateId,
        { subject: row.subject!, body: row.body!, format: row.format! },
        expectedDraftRevision,
        actor,
        version
      );
    }

    public async startDraftFromDefault(
      brandId: string,
      templateId: string,
      expectedDraftRevision: number | null,
      actor: EmailAdminActor
    ) {
      return this.saveDraft(
        brandId,
        templateId,
        await this.getDefault(brandId, templateId),
        expectedDraftRevision,
        actor,
        null
      );
    }

    private async accessibleRecord(brandId: string, oid: string, user: UserModel) {
      const brand = BrandingService.getBrandById(brandId);
      try {
        const record = await RecordsService.getMeta(oid);
        if (
          !record ||
          record.metaMetadata?.brandId !== brandId ||
          !brand ||
          !RecordsService.hasViewAccess(
            brand,
            user,
            (user.roles ?? []) as object[],
            record as unknown as Record<string, unknown>
          )
        ) {
          throw new Error('denied');
        }
        return record;
      } catch {
        throw new EmailTemplateError('FORBIDDEN', 'Preview record is unavailable.');
      }
    }

    public async previewContextFromRecord(brandId: string, oid: string, user: UserModel, templateId?: string) {
      await this.validateBrand(brandId);
      const record = await this.accessibleRecord(brandId, oid, user);
      const selected = templateId ?? Object.keys(sails.config.emailnotification.templates ?? {})[0];
      if (!selected) throw new EmailTemplateError('UNKNOWN_TEMPLATE', 'Select an email template for preview context.');
      emailTemplateDefinition(selected);
      const context = filterEmailPreviewContext(
        await EmailService.buildPreviewContext(selected, { record, oid, imports: { record, oid } }, brandId)
      );
      // The legacy `imports` alias is rebuilt from `record` on every preview, so it is
      // not offered for editing.
      delete context['imports'];
      if (Buffer.byteLength(JSON.stringify(context), 'utf8') > emailAdminSetting('maxPreviewContextBytes')) {
        throw new EmailTemplateError('LENGTH_LIMIT', 'Preview context exceeds maxPreviewContextBytes.');
      }
      return { context };
    }

    public async preview(
      brandId: string,
      templateId: string,
      content: EmailAdminContent,
      contextJson: string,
      source?: 'default' | 'override'
    ): Promise<EmailAdminPreview> {
      await this.scope(brandId, templateId);
      const diagnostics = this.validate(content);
      if (source !== undefined && !['default', 'override'].includes(source))
        throw new EmailTemplateError('INVALID_CONTEXT', 'Invalid preview source.');
      if (typeof contextJson !== 'string')
        throw new EmailTemplateError('INVALID_CONTEXT', 'Context must be a JSON string.');
      if (Buffer.byteLength(contextJson, 'utf8') > emailAdminSetting('maxPreviewContextBytes'))
        throw new EmailTemplateError('LENGTH_LIMIT', 'Preview context exceeds maxPreviewContextBytes.');
      const integration = await emailTemplateContextKind(brandId, templateId) === 'integration';
      const roots = integration ? new Set(Object.keys(integrationEmailContextSchema(templateId, brandId).properties!)) : emailTemplateContextRoots();
      let data: Record<string, unknown>;
      try {
        // Always rebuild the legacy `imports` alias from `record`, as record-based sends do;
        // any submitted `imports` value is replaced, never trusted.
        const submitted = filterEmailPreviewContext(JSON.parse(contextJson), roots);
        data = integration ? submitted : filterEmailPreviewContext(curateEmailRecordData({ ...submitted, imports: {} }));
      } catch (error) {
        if (error instanceof EmailTemplateError) throw error;
        throw new EmailTemplateError('INVALID_CONTEXT', 'Context must be a JSON object.');
      }
      if (diagnostics.length) return { subject: '', sanitiserRemovals: [], diagnostics };
      let rendered: Record<string, unknown>;
      try {
        let integrationPreview: Parameters<typeof renderEmailAdminPreview>[4];
        if (integration) {
          const supplied = await this.getDefault(brandId, templateId);
          integrationPreview = {
            context: { brandId, defaultSubject: typeof data.title === 'string' ? data.title : undefined },
            suppliedDefault: source === 'default' && supplied.subject === content.subject &&
              supplied.body === content.body && supplied.format === content.format,
          };
        }
        rendered = await renderEmailAdminPreview(EmailService, templateId, content, data, integrationPreview);
      } catch (error) {
        if (error instanceof EmailTemplateError && error.code !== 'RENDER_FAILED') throw error;
        // Only the failing field and position are reported; rendering errors never carry template text.
        const at = error instanceof EmailTemplateError ? error.diagnostic : undefined;
        return { subject: '', sanitiserRemovals: [], diagnostics: [
          { code: 'RENDER_FAILED', severity: 'error', field: at?.field ?? 'body', reason: 'RENDER_FAILED',
            line: at?.line ?? 1, column: at?.column ?? 1 },
        ] };
      }
      const subject = hardenEmailSubject(String(rendered['subject']));
      let body = String(rendered['body']);
      validateEmailLength(body, 'body');
      let sanitiserRemovals: Array<{ element?: string; attribute?: string }> = [];
      if (content.format === 'html') {
        try {
          const result = DomSanitizerService.sanitizeEmail(body, true);
          body = result.sanitized;
          sanitiserRemovals = result.removals ?? (result.removed ? [{ element: 'markup' }] : []);
        } catch {
          throw new EmailTemplateError('SANITISATION_FAILED', 'Unable to sanitise email HTML.');
        }
      }
      validateEmailLength(body, 'body');
      return {
        subject,
        ...(content.format === 'html' ? { html: body } : { text: body }),
        sanitiserRemovals,
        diagnostics,
      };
    }

    public async searchPreviewRecords(
      brandId: string,
      user: UserModel,
      query: string,
      page = 1
    ): Promise<EmailAdminRecordSearch> {
      await this.validateBrand(brandId);
      if (typeof query !== 'string' || query.length > 200 || !Number.isSafeInteger(page) || page < 1 || page > 1000) {
        throw new EmailTemplateError(
          'INVALID_CONTEXT',
          'Search requires q (at most 200 characters) and page (1 to 1000).'
        );
      }
      const brand = BrandingService.getBrandById(brandId) as BrandingModel;
      const records: Array<{ oid: string; title: string }> = [];
      if (page === 1 && /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,199}$/.test(query.trim())) {
        try {
          const oid = query.trim();
          const exact = await this.accessibleRecord(brandId, oid, user);
          const title = (exact.metadata as Record<string, unknown>)?.title;
          records.push({ oid, title: typeof title === 'string' ? title : oid });
        } catch (error) {
          if (!(error instanceof EmailTemplateError) || error.code !== 'FORBIDDEN') throw error;
        }
      }
      // Existing configured search adapter; no new storage-query surface. Quote input to prevent query injection.
      const search = sails.services[sails.config.search.serviceName.toLowerCase()] as unknown as SearchService;
      const escaped = query.trim().replace(/[+\-!(){}[\]^"~*?:\\/|&]/g, '\\$&');
      const result = await this.persist(() =>
        search.searchFuzzy(
          'default',
          '*',
          '',
          escaped ? `"${escaped}"` : '*',
          [],
          [],
          brand,
          user,
          (user.roles ?? []) as RoleModel[],
          ['storage_id', 'metadata_title'],
          (page - 1) * 10,
          11
        )
      );
      for (const candidate of ((result.records ?? []) as Array<{ storage_id?: string }>).slice(0, 10)) {
        if (
          typeof candidate.storage_id !== 'string' ||
          records.some(record => record.oid === candidate.storage_id) ||
          records.length === 10
        )
          continue;
        try {
          const record = await this.accessibleRecord(brandId, candidate.storage_id, user);
          const title = (record.metadata as Record<string, unknown>)?.title;
          records.push({ oid: candidate.storage_id, title: typeof title === 'string' ? title : candidate.storage_id });
        } catch (error) {
          if (!(error instanceof EmailTemplateError) || error.code !== 'FORBIDDEN') throw error;
        }
      }
      // Never disclose Solr's pre-filter total or metadata for inaccessible records.
      return { records, page, hasMore: records.length === 10 && ((result.records as unknown[])?.length ?? 0) > 10 };
    }
  }
}

declare global {
  const EmailTemplateAdminService: Services.EmailTemplateAdmin;
}
