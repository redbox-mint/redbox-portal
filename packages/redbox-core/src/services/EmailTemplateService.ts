import { emailSyntaxDiagnostic, emailSyntaxSourcePosition, type EmailSyntaxHelper } from '../utilities/EmailTemplateSyntax';
import { scanEmailTemplateComplexity, defaultEmailTemplateComplexityLimits } from '../utilities/EmailTemplateComplexity';
import { createHash } from 'node:crypto';
import type { EmailAdminCurrent, EmailAdminActor, EmailAdminConsistency } from '@researchdatabox/sails-ng-common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db, ObjectId } from 'mongodb';
import { handlebarsInstance, handlebarsPrecompile, normaliseVisual } from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import type { EmailTemplateAttributes } from '../waterline-models/EmailTemplate';

export type EmailTemplateErrorCode =
  | 'FORBIDDEN'
  | 'UNKNOWN_VERSION'
  | 'UNKNOWN_RECORD_TYPE'
  | 'INVALID_SCHEMA_TARGET'
  | 'PREVIEW_FRAME_UNAVAILABLE'
  | 'INVALID_CONTEXT'
  | 'INCOMPLETE_TRANSITION'
  | 'UNKNOWN_BRAND'
  | 'UNKNOWN_TEMPLATE'
  | 'MISSING_DEFAULT'
  | 'INVALID_TEMPLATE'
  | 'REVISION_CONFLICT'
  | 'PERSISTENCE'
  | 'RENDER_FAILED'
  | 'SANITISATION_FAILED'
  | 'LENGTH_LIMIT'
  | 'TOO_COMPLEX';

export class EmailTemplateError extends Error {
  constructor(
    public readonly code: EmailTemplateErrorCode,
    message: string,
    cause?: unknown,
    public readonly diagnostic?: EmailTemplateDiagnostic
  ) {
    super(message, { cause });
    this.name = 'EmailTemplateError';
  }
}

export class EmailTemplateConflictError extends EmailTemplateError {
  constructor(brandId: string, templateId: string, public readonly current?: EmailAdminCurrent) {
    super('REVISION_CONFLICT', `Email template '${templateId}' for brand '${brandId}' changed; reload before editing.`);
    this.name = 'EmailTemplateConflictError';
  }
}

/**
 * Optimistic-concurrency token. Revisions are monotonic across resets; the row
 * ID also protects against a replacement of the underlying live document.
 */
export interface EmailTemplateVersion {
  id: string;
  revision: number;
}

/**
 * Build a typed error that is safe for diagnostics. Parser, render and storage
 * errors can embed template text or stored documents, so the original error is
 * never attached as a cause. Only numeric source positions are retained; even
 * an exception's name/code can contain untrusted content.
 */
export function safeEmailTemplateError(
  code: EmailTemplateErrorCode,
  message: string,
  error: unknown
): EmailTemplateError {
  const source = (error ?? {}) as { lineNumber?: unknown; column?: unknown };
  const position = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
  const details = [
    position(source.lineNumber) ? `line ${source.lineNumber}` : undefined,
    position(source.column) ? `column ${source.column}` : undefined,
  ].filter(Boolean);
  return new EmailTemplateError(code, details.length ? `${message} (${details.join(', ')})` : message);
}

export interface EmailTemplateContent {
  subject: string;
  body: string;
  format: 'html' | 'text';
}

export interface ResolvedEmailTemplate extends EmailTemplateContent {
  source: 'default' | 'override';
  templateId: string;
  fileName?: string;
  brandId?: string;
  id?: string;
  revision?: number;
}

// Config keys are stable identities. File-only defaults remain usable for legacy
// hooks and bundled templates that have no templates config entry.
export function emailTemplateDefinition(templateId: string): {
  fileName: string;
  subject: string;
  format: 'html' | 'text';
  description?: string;
} {
  if (typeof templateId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(templateId)) {
    throw new EmailTemplateError('UNKNOWN_TEMPLATE', `Unknown email template '${templateId}'.`);
  }
  const config = sails.config.emailnotification;
  const entry = Object.hasOwn(config.templates ?? {}, templateId) ? config.templates[templateId] : undefined;
  const fileName = entry?.template ?? templateId;
  if (!entry && !existsSync(join(config.settings.templateDir, `${fileName}.hbs`))) {
    throw new EmailTemplateError('UNKNOWN_TEMPLATE', `Unknown email template '${templateId}'.`);
  }
  return {
    fileName,
    ...(entry?.description !== undefined ? { description: entry.description } : {}),
    subject: entry?.subject ?? config.defaults.subject,
    format: entry?.format ?? config.defaults.format,
  };
}

export interface EmailTemplateDiagnostic {
  field: 'subject' | 'body';
  reason: 'UNKNOWN_CONTEXT_ROOT' | 'UNKNOWN_HELPER' | 'UNSUPPORTED_CONSTRUCT' | 'INVALID_SYNTAX' | 'TOO_COMPLEX' | 'UNCLOSED_BLOCK' | 'MISMATCHED_CLOSE' | 'UNEXPECTED_TOKEN';
  helper?: EmailSyntaxHelper;
  line: number;
  column: number;
}

// Core legacy display values plus every IntegrationNotificationPayload key.
const contextRoots = [
  'record', 'oid', 'imports', 'portal', 'sailsConfig', 'name', 'data',
  'kind', 'title', 'summary', 'severity', 'redboxOid', 'brandId', 'integrationName',
  'integrationAction', 'status', 'triggeredBy', 'message', 'errorDetail', 'httpStatusCode',
  'traceId', 'spanId', 'startedAt', 'completedAt', 'durationMs', 'recordUrl', 'timestamp',
];

export function emailTemplateContextRoots(): Set<string> {
  const configured = sails.config.emailnotification?.settings?.additionalContextRoots;
  const extra = configured === undefined ? [] : configured;
  if (!Array.isArray(extra) || extra.some(root => typeof root !== 'string' ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(root) || ['__proto__', 'constructor', 'prototype'].includes(root))) {
    throw new EmailTemplateError('INVALID_TEMPLATE',
      'emailnotification.settings.additionalContextRoots must be an array of context root identifiers.');
  }
  return new Set([...contextRoots, ...extra]);
}

/** Byte limits apply both to source and output, before expensive parsing/sanitisation. */
export function validateEmailLength(value: string, field: 'subject' | 'body'): void {
  const key = field === 'subject' ? 'maxSubjectBytes' : 'maxBodyBytes';
  const configured = sails.config.emailnotification?.settings?.[key];
  const limit = configured === undefined ? (field === 'subject' ? 998 : 1048576) : configured;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new EmailTemplateError('INVALID_TEMPLATE', `emailnotification.settings.${key} must be a positive safe integer.`);
  }
  if (Buffer.byteLength(value, 'utf8') > limit) {
    throw new EmailTemplateError('LENGTH_LIMIT', `Email ${field} exceeds ${key} (${limit} UTF-8 bytes).`);
  }
}

/** Shared policy/lint limits; checked at startup even when no template is rendered. */
export function emailTemplateComplexityLimits() {
  const settings = sails.config.emailnotification?.settings;
  const maxNesting = settings?.maxTemplateNesting === undefined ? defaultEmailTemplateComplexityLimits.maxNesting : settings.maxTemplateNesting;
  const maxExpressions = settings?.maxTemplateExpressions === undefined ? defaultEmailTemplateComplexityLimits.maxExpressions : settings.maxTemplateExpressions;
  for (const [key, value] of Object.entries({ maxTemplateNesting: maxNesting, maxTemplateExpressions: maxExpressions })) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new EmailTemplateError('INVALID_TEMPLATE', `emailnotification.settings.${key} must be a positive safe integer.`);
    }
  }
  return { maxNesting, maxExpressions };
}

export function hardenEmailSubject(subject: string): string {
  validateEmailLength(subject, 'subject');
  // C0/C1 controls, CR/LF, DEL and Unicode line/paragraph separators.
  return Array.from(subject).filter(char => {
    const code = char.codePointAt(0)!;
    return code > 31 && !(code >= 127 && code <= 159) && code !== 0x2028 && code !== 0x2029;
  }).join('');
}

/** Request-local policy ASTs, reused by advisory schema lint without reparsing. */
export type EmailTemplateAsts = Partial<Record<'subject' | 'body', hbs.AST.Program>>;

function validateExpressions(source: string, field: 'subject' | 'body'): hbs.AST.Program {
  const handlebars = handlebarsInstance();
  const roots = emailTemplateContextRoots();
  const fail = (node: hbs.AST.Node, reason: EmailTemplateDiagnostic['reason']): never => {
    const { line, column } = node.loc.start;
    throw new EmailTemplateError('INVALID_TEMPLATE',
      `Email ${field}: ${reason} at line ${line}, column ${column + 1}.`, undefined,
      { field, reason, line, column: column + 1 });
  };
  // Root checks are an authoring aid, not the data-exposure boundary. Only
  // reject paths whose resolution context is certainly the template root.
  type Frame = { certainRoot: boolean };
  const scoped = (node: hbs.AST.PathExpression) => /^(?:\.|this\b)/.test(node.original);
  const path = (node: hbs.AST.PathExpression, frames: Frame[], params: Set<string>): void => {
    let parts = node.parts;
    let certainRoot: boolean;
    if (node.data) {
      // Block params are resolved before data variables (e.g. `as |root|` shadows @root).
      if (parts[0] !== 'root' || params.has('root')) return;
      certainRoot = true;
      parts = parts.slice(1);
    } else if (node.depth === 0 && !scoped(node) && params.has(parts[0])) {
      // Block params are lexical names, never parent/current-context paths.
      return;
    } else {
      certainRoot = frames[frames.length - 1 - node.depth]?.certainRoot === true;
    }
    if (certainRoot && parts.length && !roots.has(parts[0])) fail(node, 'UNKNOWN_CONTEXT_ROOT');
  };
  const visit = (node: hbs.AST.Node, frames: Frame[], params: Set<string>): void => {
    if (['PartialStatement', 'PartialBlockStatement', 'Decorator', 'DecoratorBlock'].includes(node.type)) {
      fail(node, 'UNSUPPORTED_CONSTRUCT');
    }
    if (node.type === 'PathExpression') {
      path(node as hbs.AST.PathExpression, frames, params);
      return;
    }
    if (node.type === 'Program') {
      const program = node as hbs.AST.Program;
      const scopeParams = new Set(params);
      program.blockParams?.forEach(name => scopeParams.add(name));
      program.body.forEach(child => visit(child, frames, scopeParams));
    } else if (['MustacheStatement', 'BlockStatement', 'SubExpression'].includes(node.type)) {
      const expression = node as hbs.AST.MustacheStatement | hbs.AST.BlockStatement | hbs.AST.SubExpression;
      // Handlebars converts every literal invocation head to a single-part path,
      // including quoted names, numbers, booleans, null and undefined.
      const original = expression.path as hbs.AST.PathExpression;
      const head: hbs.AST.PathExpression = original.type === 'PathExpression' ? original : {
        type: 'PathExpression', data: false, depth: 0, parts: [String(original.original)],
        original: String(original.original), loc: original.loc,
      };
      // Block params are lexical values; Handlebars resolves them (with or without an
      // `@` prefix) before helpers and data variables. Only a single-part head ignores
      // its arguments: a dotted head (`as |p|` ... `p.title (x)`) still evaluates them.
      const lexicalHead = head.depth === 0 && !scoped(head) && params.has(head.parts[0]);
      const blockParam = lexicalHead && head.parts.length === 1;
      const helper = head.depth === 0 && !head.data && !scoped(head) && !blockParam &&
        Object.hasOwn(handlebars.helpers, head.original);
      const invocation = node.type === 'SubExpression' || expression.params.length > 0 || expression.hash?.pairs.length > 0;
      if (!helper) {
        if (invocation && !lexicalHead) fail(head, 'UNKNOWN_HELPER');
        if (!lexicalHead) visit(head, frames, params);
      }
      if (!blockParam) {
        expression.params.forEach(child => visit(child, frames, params));
        expression.hash?.pairs.forEach(pair => visit(pair.value, frames, params));
      }
      if (node.type === 'BlockStatement') {
        const block = node as hbs.AST.BlockStatement;
        // Helper context semantics can't be established reliably (helpers can be
        // replaced or wrapped), so every block program and inverse is uncertain:
        // relative paths inside blocks are left to strict rendering.
        const uncertain: Frame[] = [{ certainRoot: false }];
        if (block.program) visit(block.program, uncertain, params);
        if (block.inverse) visit(block.inverse, uncertain, params);
      }
    }
  };
  const ast = handlebars.parse(source);
  visit(ast, [{ certainRoot: true }], new Set());
  return ast;
}

/** DB content is schema-checked; supplied files retain hook-specific display roots. */
export function validateEmailTemplate(
  content: EmailTemplateContent,
  validateContext = true,
  parsed?: EmailTemplateAsts
): void {
  if (!content || typeof content.subject !== 'string' || !content.subject.trim() ||
    typeof content.body !== 'string' || !content.body.trim() || !['html', 'text'].includes(content.format)) {
    throw new EmailTemplateError('INVALID_TEMPLATE', 'Email templates require non-empty subject/body and html or text format.');
  }
  // Scan both fields before the first precompile/parse, including supplied files.
  const limits = emailTemplateComplexityLimits();
  const source = { subject: content.subject, body: content.body };
  for (const field of ['subject', 'body'] as const) {
    validateEmailLength(content[field], field);
    source[field] = normaliseVisual(content[field]);
    if (scanEmailTemplateComplexity(source[field], limits).exceeded) {
      throw new EmailTemplateError('TOO_COMPLEX',
        'Email template exceeds the configured expression or nesting limit.', undefined,
        { field, reason: 'TOO_COMPLEX', line: 1, column: 1 });
    }
  }
  for (const field of ['subject', 'body'] as const) {
    try {
      handlebarsPrecompile(source[field], { strict: true });
      if (validateContext) {
        const ast = validateExpressions(source[field], field);
        if (parsed) parsed[field] = ast;
      }
    } catch (error) {
      if (error instanceof EmailTemplateError) throw error;
      const syntax = emailSyntaxDiagnostic(source[field]);
      const diagnostic = { field, ...syntax, ...emailSyntaxSourcePosition(content[field], syntax) };
      throw new EmailTemplateError('INVALID_TEMPLATE',
        `Email ${field}: ${diagnostic.reason} at line ${diagnostic.line}, column ${diagnostic.column}.`,
        undefined, diagnostic);
    }
  }
}

export function readEmailTemplateDefault(templateId: string): ResolvedEmailTemplate {
  const definition = emailTemplateDefinition(templateId);
  let body: string;
  try {
    body = readFileSync(
      join(sails.config.emailnotification.settings.templateDir, `${definition.fileName}.hbs`),
      'utf8'
    );
  } catch (error) {
    throw new EmailTemplateError(
      'MISSING_DEFAULT',
      `Cannot read supplied default for email template '${templateId}'.`,
      error
    );
  }
  const result = { ...definition, templateId, body, source: 'default' as const };
  validateEmailTemplate(result, false);
  return result;
}


/** Only source content participates; config aliases and file names do not. */
export function emailDefaultHash(content: EmailTemplateContent): string {
  return createHash('sha256').update(JSON.stringify([content.subject, content.body, content.format])).digest('hex');
}

export function emailAdminSetting(key: 'historyMaxVersions' | 'maxPreviewContextBytes'): number {
  const value = sails.config.emailnotification?.settings?.[key] ?? (key === 'historyMaxVersions' ? 50 : 262144);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new EmailTemplateError('INVALID_TEMPLATE', `emailnotification.settings.${key} must be a positive safe integer.`);
  }
  return value;
}

export interface EmailHistoryRow {
  _id?: ObjectId;
  brandId: string; templateId: string; version: number;
  event: 'publish' | 'reset' | 'restore-published';
  subject: string | null; body: string | null; format: 'html' | 'text' | null;
  restoredFromVersion: number | null; defaultHash: string;
  liveId: string | null; previousLiveToken: EmailTemplateVersion | null;
  draftRevision: number | null; actorId: string; actorDisplayName: string; createdAt: string;
}

/** Private, unpruned lifecycle fence; no template content is stored here. */
interface EmailLifecycleHead {
  brandId: string; templateId: string;
  version: number; committedVersion: number;
  liveToken: EmailTemplateVersion | null;
  reservation: number | null;
}

interface EmailReconciliation {
  brandId: string; templateId: string; version: number;
  outcome: 'completed' | 'rolled-back'; actorId: string; actorDisplayName: string; createdAt: string;
}

export namespace Services {
  export class EmailTemplates extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'bootstrap',
      'get',
      'list',
      'reportInvalidOverrides',
      'reportInconsistencies',
      'reconcileTransition',
      'getDefault',
      'create',
      'update',
      'upsert',
      'reset',
      'resolve',
    ];

    public async bootstrap(): Promise<void> {
      // migrate:safe does not create indexes. Ensure the production Mongo index
      // explicitly, before jobs can send or concurrent writers can create rows.
      // Other adapters (e.g. sails-disk in lightweight test apps) can still read
      // overrides through Waterline; atomic writes require native Mongo access.
      for (const entry of Object.values(sails.config.emailnotification?.templates ?? {})) {
        if (entry.description !== undefined && typeof entry.description !== 'string')
          throw new EmailTemplateError('INVALID_TEMPLATE', 'Email template description must be a string.');
      }
      emailTemplateComplexityLimits();
      emailAdminSetting('historyMaxVersions');
      emailAdminSetting('maxPreviewContextBytes');
      const native = this.native();
      if (!native) {
        // A sails-mongo datastore without native handles is a misconfiguration,
        // not an intentional non-Mongo setup: fail startup rather than degrade.
        const adapter = (EmailTemplate.getDatastore() as unknown as { config?: { adapter?: unknown } } | undefined)
          ?.config?.adapter;
        if (adapter === 'sails-mongo') {
          throw new EmailTemplateError('PERSISTENCE', 'sails-mongo datastore is missing native Mongo handles.');
        }
        sails.log.warn('EmailTemplateService: datastore has no native Mongo access; override writes are disabled.');
        return;
      }
      const { db } = native;
      await this.persist(() =>
        db.collection(EmailTemplate.tableName).createIndex({ brandId: 1, templateId: 1 }, { unique: true })
      );
      await this.persist(() => db.collection(EmailTemplateDraft.tableName)
        .createIndex({ brandId: 1, templateId: 1 }, { unique: true }));
      await this.persist(() => db.collection(EmailTemplateHistory.tableName)
        .createIndex({ brandId: 1, templateId: 1, version: 1 }, { unique: true }));
      await this.persist(() => this.heads().createIndex({ brandId: 1, templateId: 1 }, { unique: true }));
      await this.persist(() => this.reconciliations().createIndex({ brandId: 1, templateId: 1, version: 1 }, { unique: true }));
      // Mongo's built-in unique _id index protects this private revision ledger.
      // It survives draft deletion so old autosave requests cannot match a new draft.
    }

    protected async validateBrand(brandId: string): Promise<void> {
      if (typeof brandId !== 'string' || !brandId.trim()) {
        throw new EmailTemplateError('UNKNOWN_BRAND', 'An explicit, non-empty brand ID is required.');
      }
      const brand = await this.persist(() => BrandingConfig.findOne({ id: brandId }));
      if (!brand) throw new EmailTemplateError('UNKNOWN_BRAND', `Unknown email template brand '${brandId}'.`);
    }

    protected async persist<T>(operation: () => PromiseLike<T>): Promise<T> {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof EmailTemplateError) throw error;
        const failure = safeEmailTemplateError('PERSISTENCE', 'Email template storage operation failed.', error);
        // Record the same safe instance callers propagate, so chronicles de-duplicate it.
        this.updateChronicle({ emailTemplateStorageOutcome: 'failed' }, [failure]);
        throw failure;
      }
    }

    protected validateStored(row: EmailTemplateAttributes, brandId: string, templateId: string): EmailTemplateAttributes {
      validateEmailTemplate(row);
      if (
        row.brandId !== brandId ||
        row.templateId !== templateId ||
        row.uid !== JSON.stringify([brandId, templateId]) ||
        !Number.isSafeInteger(row.revision) ||
        row.revision < 1
      ) {
        throw new EmailTemplateError(
          'INVALID_TEMPLATE',
          `Invalid stored email template identity/revision for '${templateId}'.`
        );
      }
      return row;
    }

    public async get(brandId: string, templateId: string): Promise<EmailTemplateAttributes | null> {
      await this.validateBrand(brandId);
      emailTemplateDefinition(templateId);
      const row = await this.persist(() => EmailTemplate.findOne({ brandId, templateId }));
      return row ? this.validateStored(row, brandId, templateId) : null;
    }

    public async list(brandId: string): Promise<EmailTemplateAttributes[]> {
      await this.validateBrand(brandId);
      const rows = (await this.persist(() => EmailTemplate.find({ brandId }))) as EmailTemplateAttributes[];
      return rows.map(row => {
        emailTemplateDefinition(row.templateId);
        return this.validateStored(row, brandId, row.templateId);
      });
    }

    /** Audit raw rows without list() aborting on the first invalid override. No content is returned. */
    public async reportInvalidOverrides(brandId: string): Promise<Array<{
      brandId: string; templateId: string; id: string; revision: number;
      code: EmailTemplateErrorCode; message: string; diagnostic?: EmailTemplateDiagnostic;
    }>> {
      await this.validateBrand(brandId);
      const rows = await this.persist(() => EmailTemplate.find({ brandId })) as EmailTemplateAttributes[];
      const failures = [];
      for (const row of rows) {
        try {
          emailTemplateDefinition(row.templateId);
          this.validateStored(row, brandId, row.templateId);
        } catch (error) {
          if (!(error instanceof EmailTemplateError)) throw error;
          failures.push({ brandId, templateId: row.templateId, id: row.id, revision: row.revision,
            code: error.code, message: error.message, diagnostic: error.diagnostic });
        }
      }
      return failures;
    }

    public async getDefault(brandId: string, templateId: string): Promise<ResolvedEmailTemplate> {
      await this.validateBrand(brandId);
      return readEmailTemplateDefault(templateId);
    }

    public async resolve(templateId: string, brandId?: string): Promise<ResolvedEmailTemplate> {
      // No inferred default tenant: legacy calls can never read a DB override.
      if (brandId === undefined) return readEmailTemplateDefault(templateId);
      const row = await this.get(brandId, templateId);
      if (!row) return readEmailTemplateDefault(templateId);
      return {
        subject: row.subject,
        body: row.body,
        format: row.format,
        templateId,
        brandId,
        id: row.id,
        revision: row.revision,
        source: 'override',
      };
    }

    public async create(brandId: string, templateId: string, content: EmailTemplateContent, updatedBy?: string): Promise<EmailTemplateAttributes> {
      return (await this.commitLive(brandId, templateId, content, null, { id: updatedBy ?? '', name: '' }))!;
    }

    public async update(brandId: string, templateId: string, content: EmailTemplateContent,
      expected: EmailTemplateVersion, updatedBy?: string): Promise<EmailTemplateAttributes> {
      return (await this.commitLive(brandId, templateId, content, expected, { id: updatedBy ?? '', name: '' }))!;
    }

    /** expected=null creates; a version token updates. Never blindly overwrites. */
    public async upsert(brandId: string, templateId: string, content: EmailTemplateContent,
      expected: EmailTemplateVersion | null, updatedBy?: string): Promise<EmailTemplateAttributes> {
      return expected === null ? this.create(brandId, templateId, content, updatedBy)
        : this.update(brandId, templateId, content, expected, updatedBy);
    }

    public async reset(brandId: string, templateId: string, expected: EmailTemplateVersion): Promise<ResolvedEmailTemplate> {
      const suppliedDefault = await this.getDefault(brandId, templateId);
      await this.commitLive(brandId, templateId, null, expected, { id: '', name: '' });
      return suppliedDefault;
    }

    protected historyCollection() {
      return this.requireNative().db.collection<EmailHistoryRow>(EmailTemplateHistory.tableName);
    }

    protected async latestHistory(brandId: string, templateId: string): Promise<EmailHistoryRow | null> {
      return this.persist(() => this.historyCollection().findOne({ brandId, templateId }, { sort: { version: -1 } }));
    }

    protected async rawLive(brandId: string, templateId: string): Promise<EmailTemplateAttributes | null> {
      return (await this.persist(() => EmailTemplate.findOne({ brandId, templateId }))) ?? null;
    }

    protected token(row: EmailTemplateAttributes | null): EmailTemplateVersion | null {
      return row ? { id: String(row.id), revision: row.revision } : null;
    }

    protected transitionMatches(row: EmailTemplateAttributes | null, latest: EmailHistoryRow): boolean {
      return latest.event === 'reset' ? row === null
        : row !== null && String(row.id) === latest.liveId && row.revision === latest.version;
    }

    protected async conflict(brandId: string, templateId: string): Promise<never> {
      const row = await this.rawLive(brandId, templateId);
      const draft = await this.persist(() => this.requireNative().db.collection(EmailTemplateDraft.tableName).findOne({ brandId, templateId }));
      const last = await this.latestHistory(brandId, templateId);
      const change = (value: { updatedBy?: unknown; updatedByName?: unknown; updatedAt?: unknown }) => ({
        updatedBy: typeof value.updatedBy === 'string' ? value.updatedBy : null,
        updatedByName: typeof value.updatedByName === 'string' ? value.updatedByName : null,
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
      });
      throw new EmailTemplateConflictError(brandId, templateId, {
        live: row ? { token: this.token(row)!, ...change(row) } : null,
        draft: draft ? { draftRevision: draft.draftRevision, ...change({ updatedBy: draft.updatedBy, updatedByName: draft.updatedByName, updatedAt: draft.updatedAt }) } : null,
        latestVersion: await this.latestVersion(brandId, templateId),
        lastChange: last ? { updatedBy: last.actorId || null, updatedByName: last.actorDisplayName || null, updatedAt: last.createdAt } : null,
      });
    }

    protected heads() {
      return this.requireNative().db.collection<EmailLifecycleHead>('emailtemplatelifecyclehead');
    }

    protected reconciliations() {
      return this.requireNative().db.collection<EmailReconciliation>('emailtemplatereconciliation');
    }

    protected sameToken(left: EmailTemplateVersion | null, right: EmailTemplateVersion | null): boolean {
      return left === null || right === null ? left === right : left.id === right.id && left.revision === right.revision;
    }

    /** Read-only callers never initialize heads. The unique index arbitrates legacy initialization. */
    protected async lifecycleHead(brandId: string, templateId: string): Promise<EmailLifecycleHead> {
      const scope = { brandId, templateId };
      const found = await this.persist(() => this.heads().findOne(scope));
      if (found) return found;
      const live = await this.rawLive(brandId, templateId);
      const latest = await this.latestHistory(brandId, templateId);
      const head = await this.deriveLifecycleHead(brandId, templateId, live, latest);
      await this.persist(async () => {
        try { await this.heads().insertOne(head); }
        catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
      });
      return (await this.persist(() => this.heads().findOne(scope)))!;
    }

    protected async deriveLifecycleHead(brandId: string, templateId: string,
      live: EmailTemplateAttributes | null, latest: EmailHistoryRow | null): Promise<EmailLifecycleHead> {
      const incomplete = latest && !this.transitionMatches(live, latest);
      const version = Math.max(live?.revision ?? 0, latest?.version ?? 0);
      // A headless failed create may follow a committed reset. Preserve that
      // default generation as well as legacy live rows that have no history.
      const resets = incomplete && !live ? await this.persist(() => this.historyCollection()
        .find({ brandId, templateId, event: 'reset' }).sort({ version: -1 }).toArray()) : [];
      const committedVersion = incomplete ? (live?.revision ?? resets.find(row => row.version < latest.version)?.version ?? 0) : version;
      return { brandId, templateId, version, committedVersion,
        liveToken: this.token(live), reservation: incomplete ? latest.version : null };
    }

    protected async latestVersion(brandId: string, templateId: string): Promise<number> {
      const head = await this.persist(() => this.heads().findOne({ brandId, templateId }));
      const latest = await this.latestHistory(brandId, templateId);
      const live = await this.rawLive(brandId, templateId);
      return Math.max(head?.version ?? 0, latest?.version ?? 0, live?.revision ?? 0);
    }

    protected async assertReservation(brandId: string, templateId: string, version: number): Promise<void> {
      const owned = await this.persist(() => this.heads().findOne({ brandId, templateId, version, reservation: version }));
      if (!owned) return this.conflict(brandId, templateId);
    }

    protected async finishReservation(brandId: string, templateId: string, version: number,
      liveToken: EmailTemplateVersion | null, committedVersion = version): Promise<void> {
      const finished = await this.persist(() => this.heads().findOneAndUpdate(
        { brandId, templateId, version, reservation: version },
        { $set: { committedVersion, liveToken, reservation: null } },
        { returnDocument: 'after', includeResultMetadata: false }));
      if (!finished) return this.conflict(brandId, templateId);
    }

    /** Every writer reserves against an unpruned head before writing history or live. */
    protected async commitLive(brandId: string, templateId: string, content: EmailTemplateContent | null,
      expected: EmailTemplateVersion | null, actor: EmailAdminActor,
      draft?: { draftRevision: number; restoredFromVersion?: number | null }): Promise<EmailTemplateAttributes | null> {
      const supplied = await this.getDefault(brandId, templateId);
      const criteria = expected === null ? null : this.versionCriteria(brandId, templateId, expected);
      const head = await this.lifecycleHead(brandId, templateId);
      const previous = await this.rawLive(brandId, templateId);
      if (expected === undefined || head.reservation !== null || !this.sameToken(head.liveToken, expected) ||
        !this.sameToken(this.token(previous), expected) || (!content && !previous)) return this.conflict(brandId, templateId);
      if (content) validateEmailTemplate(content);
      const version = head.version + 1;
      if (!Number.isSafeInteger(version)) throw new EmailTemplateError('PERSISTENCE', 'Email version counter exhausted.');
      const reserved = await this.persist(() => this.heads().findOneAndUpdate(
        { brandId, templateId, version: head.version, reservation: null },
        { $set: { version, reservation: version } }, { returnDocument: 'after', includeResultMetadata: false }));
      if (!reserved) return this.conflict(brandId, templateId);
      const { ObjectId: NativeObjectId } = this.requireNative();
      const liveId = content ? (previous?.id ?? String(new NativeObjectId())) : null;
      const now = new Date().toISOString();
      const history: EmailHistoryRow = {
        brandId, templateId, version, event: content ? (draft?.restoredFromVersion ? 'restore-published' : 'publish') : 'reset',
        subject: content?.subject ?? null, body: content?.body ?? null, format: content?.format ?? null,
        restoredFromVersion: draft?.restoredFromVersion ?? null, defaultHash: emailDefaultHash(supplied), liveId,
        previousLiveToken: this.token(previous), draftRevision: draft?.draftRevision ?? null,
        actorId: actor.id, actorDisplayName: actor.name, createdAt: now,
      };
      await this.assertReservation(brandId, templateId, version);
      await this.persist(async () => {
        try { await this.historyCollection().insertOne(history); }
        catch (error) {
          if ((error as { code?: number }).code === 11000) return this.conflict(brandId, templateId);
          throw error;
        }
      });
      await this.assertReservation(brandId, templateId, version);
      const row = await this.applyHistory(history, criteria);
      // Never release a reservation on an uncertain driver result. Reconciliation requires quiesced writers.
      await this.finishReservation(brandId, templateId, version, this.token(row));
      try { await this.pruneHistory(brandId, templateId, version); }
      catch { this.updateChronicle({ emailHistoryPruningOutcome: 'failed' }, [], 'warn'); }
      return row;
    }

    protected async applyHistory(history: EmailHistoryRow, criteria = history.previousLiveToken === null ? null
      : this.versionCriteria(history.brandId, history.templateId, history.previousLiveToken)): Promise<EmailTemplateAttributes | null> {
      const { brandId, templateId, version, liveId, createdAt: now } = history;
      const collection = this.collection();
      if (history.event === 'reset') {
        if (!criteria) return this.conflict(brandId, templateId);
        const removed = await this.persist(() => collection.deleteOne(criteria));
        if (removed.deletedCount !== 1) return this.conflict(brandId, templateId);
        return null;
      }
      const content = { subject: history.subject!, body: history.body!, format: history.format! };
      validateEmailTemplate(content);
      const values = { uid: JSON.stringify([brandId, templateId]), brandId, templateId, ...content,
        revision: version, defaultHash: history.defaultHash,
        updatedBy: history.actorId, updatedByName: history.actorDisplayName, updatedAt: now };
      if (criteria) {
        const updated = await this.persist(() => collection.findOneAndUpdate(criteria, { $set: values },
          { returnDocument: 'after', includeResultMetadata: false }));
        if (!updated) return this.conflict(brandId, templateId);
        const { _id, ...attrs } = updated;
        return { ...attrs, id: String(_id) };
      }
      const { ObjectId: NativeObjectId } = this.requireNative();
      await this.persist(async () => {
        try { await collection.insertOne({ ...values, _id: new NativeObjectId(liveId!), createdAt: now }); }
        catch (error) {
          if ((error as { code?: number }).code === 11000) return this.conflict(brandId, templateId);
          throw error;
        }
      });
      return { ...values, id: liveId!, createdAt: now };
    }

    /** A stale pruner can remove only versions older than its own committed transition.
     * The permanent head bounds it further; reservations and newer live transitions are never candidates. */
    protected async pruneHistory(brandId: string, templateId: string, committedVersion: number): Promise<void> {
      const head = await this.persist(() => this.heads().findOne({ brandId, templateId }));
      if (!head) return;
      const bound = Math.min(committedVersion, head.committedVersion);
      const rows = await this.persist(() => this.historyCollection().find({ brandId, templateId })
        .sort({ version: -1 }).toArray());
      const keep = new Set(rows.slice(0, emailAdminSetting('historyMaxVersions')).map(row => row.version));
      if (head.liveToken) keep.add(head.liveToken.revision);
      if (head.reservation !== null) keep.add(head.reservation);
      const remove = rows.filter(row => row.version < bound && !keep.has(row.version)).map(row => row.version);
      if (remove.length) await this.persist(() => this.historyCollection().deleteMany({ brandId, templateId, version: { $in: remove } }));
    }

    /** Operator-only console tool. Inspection is read-only; actions require all writers/requests drained.
     * Rollback consumes the reserved version and keeps history plus a permanent content-free audit record.
     * If live already matches an uncertain write, always complete it; never revert delivered content. */
    public async reconcileTransition(brandId: string, templateId: string,
      options: { action?: 'inspect' | 'complete' | 'rollback'; expectedVersion?: number;
        writersQuiesced?: boolean; actor?: EmailAdminActor } = {}) {
      await this.validateBrand(brandId);
      emailTemplateDefinition(templateId);
      const action = options.action ?? 'inspect';
      if (!['inspect', 'complete', 'rollback'].includes(action)) throw new EmailTemplateError('INVALID_TEMPLATE', 'Invalid reconciliation action.');
      if (action !== 'inspect' && (options.writersQuiesced !== true || !options.actor?.id || !options.actor?.name ||
        !Number.isSafeInteger(options.expectedVersion))) {
        throw new EmailTemplateError('INVALID_TEMPLATE', 'Reconciliation requires drained writers, an actor and the inspected version.');
      }
      let head: EmailLifecycleHead | null = await this.persist(() => this.heads().findOne({ brandId, templateId }));
      const latest = await this.latestHistory(brandId, templateId);
      let live = await this.rawLive(brandId, templateId);
      const version = Math.max(head?.version ?? 0, latest?.version ?? 0, live?.revision ?? 0);
      if (action !== 'inspect' && options.expectedVersion !== version) return this.conflict(brandId, templateId);
      if (!head) head = action === 'inspect' ? await this.deriveLifecycleHead(brandId, templateId, live, latest)
        : await this.lifecycleHead(brandId, templateId);
      if (action !== 'inspect' && head.version !== options.expectedVersion) return this.conflict(brandId, templateId);
      const pending = head ? head.reservation : (latest && !this.transitionMatches(live, latest) ? latest.version : null);
      const historyVersion = pending ?? head.committedVersion;
      const history = await this.persist(() => this.historyCollection().findOne({ brandId, templateId, version: historyVersion }));
      const matches = Boolean(history && this.transitionMatches(live, history));
      const priorMatches = head ? this.sameToken(this.token(live), head.liveToken)
        : Boolean(history && this.sameToken(this.token(live), history.previousLiveToken));
      const summary = (outcome: string, draftRetained = false) => ({ brandId, templateId, version,
        committedVersion: head?.committedVersion ?? (matches ? version : live?.revision ?? 0),
        pendingVersion: head ? head.reservation : pending, liveToken: this.token(live), historyPresent: Boolean(history),
        liveMatchesTransition: Boolean(history && this.transitionMatches(live, history)), previousLiveMatches: priorMatches, outcome, draftRetained });
      if (action === 'inspect') return summary(pending === null && (head ? priorMatches : !history || matches) ? 'consistent' : 'incomplete');
      if (pending === null) {
        if (!this.sameToken(this.token(live), head!.liveToken)) return this.conflict(brandId, templateId);
        const retained = history && this.transitionMatches(live, history) ? await this.cleanupPublishedDraft(history) : false;
        return summary('consistent', retained);
      }
      await this.assertReservation(brandId, templateId, pending);
      const audited = await this.persist(() => this.reconciliations().findOne({ brandId, templateId, version: pending }));
      const outcome = matches ? 'completed' : (audited?.outcome ?? (action === 'complete' ? 'completed' : 'rolled-back'));
      if (audited && audited.outcome !== outcome) return this.conflict(brandId, templateId);
      if (!matches && !priorMatches) return this.conflict(brandId, templateId);
      if (!matches && outcome === 'completed') {
        if (!history) throw new EmailTemplateError('INCOMPLETE_TRANSITION', 'Missing history; roll back the unused reservation.');
        if (history.event !== 'reset') validateEmailTemplate({ subject: history.subject!, body: history.body!, format: history.format! });
      }
      // A unique audit decision selects recovery's direction BEFORE any live write.
      // Concurrent console attempts cannot choose opposite outcomes; interruption resumes this decision.
      if (!audited) await this.persist(async () => {
        try {
          await this.reconciliations().insertOne({ brandId, templateId, version: pending,
            outcome, actorId: options.actor!.id, actorDisplayName: options.actor!.name, createdAt: new Date().toISOString() });
        } catch (error) {
          if ((error as { code?: number }).code === 11000) return this.conflict(brandId, templateId);
          throw error;
        }
      });
      if (!matches && outcome === 'completed') live = await this.applyHistory(history!);
      await this.finishReservation(brandId, templateId, pending, this.token(live),
        outcome === 'completed' ? pending : head!.committedVersion);
      const draftRetained = outcome === 'completed' && history ? await this.cleanupPublishedDraft(history) : false;
      head = (await this.persist(() => this.heads().findOne({ brandId, templateId })))!;
      return summary(outcome, draftRetained);
    }

    protected async cleanupPublishedDraft(history: EmailHistoryRow): Promise<boolean> {
      if (history.draftRevision === null) return false;
      const { brandId, templateId, draftRevision } = history;
      await this.persist(() => this.requireNative().db.collection(EmailTemplateDraft.tableName)
        .deleteOne({ brandId, templateId, draftRevision }));
      return Boolean(await this.persist(() => this.requireNative().db.collection(EmailTemplateDraft.tableName)
        .findOne({ brandId, templateId })));
    }

    /** Includes reservations with no history, and successful live writes awaiting head finalization. */
    public async reportInconsistencies(brandId: string, templateId?: string): Promise<Array<EmailAdminConsistency & { templateId: string }>> {
      await this.validateBrand(brandId);
      const scope = { brandId, ...(templateId ? { templateId } : {}) };
      const rows = await this.persist(() => this.historyCollection().find(scope).sort({ version: -1 }).toArray());
      const heads = await this.persist(() => this.heads().find(scope).toArray());
      const ids = new Set([...rows.map(row => row.templateId), ...heads.map(head => head.templateId)]);
      const result: Array<EmailAdminConsistency & { templateId: string }> = [];
      for (const id of ids) {
        const head = heads.find(value => value.templateId === id);
        const last = head ? rows.find(value => value.templateId === id && value.version === head.committedVersion)
          : rows.find(value => value.templateId === id);
        const live = await this.rawLive(brandId, id);
        if (head?.reservation != null || (head ? !this.sameToken(this.token(live), head.liveToken)
          : last && !this.transitionMatches(live, last))) {
          result.push({ templateId: id, code: 'INCOMPLETE_LIVE_TRANSITION', version: head?.version ?? last!.version });
        } else if (last && this.transitionMatches(live, last) && last.draftRevision !== null) {
          const draft = await this.persist(() => this.requireNative().db.collection(EmailTemplateDraft.tableName)
            .findOne({ brandId, templateId: id, draftRevision: last.draftRevision }));
          if (draft) result.push({ templateId: id, code: 'PUBLISHED_DRAFT_RETAINED', version: last.version });
        }
      }
      return result;
    }

    /**
     * Native handles from the model's own datastore. ObjectId must come from the
     * adapter's driver: sails-mongo bundles a different mongodb/bson major than
     * redbox-core, and the driver rejects foreign BSON types.
     */
    protected native(): { db: Db; ObjectId: typeof ObjectId } | undefined {
      const datastore = EmailTemplate.getDatastore() as unknown as
        | { manager?: Db; driver?: { mongodb?: { ObjectId?: typeof ObjectId } } }
        | undefined;
      const db = datastore?.manager;
      const objectId = datastore?.driver?.mongodb?.ObjectId;
      return typeof db?.collection === 'function' && typeof objectId === 'function'
        ? { db, ObjectId: objectId }
        : undefined;
    }

    protected requireNative() {
      const native = this.native();
      if (!native) {
        throw new EmailTemplateError(
          'PERSISTENCE',
          'Email template override writes require a native Mongo datastore.'
        );
      }
      return native;
    }

    protected collection() {
      return this.requireNative().db.collection<Omit<EmailTemplateAttributes, 'id'> & { _id: ObjectId }>(
        EmailTemplate.tableName
      );
    }

    protected versionCriteria(brandId: string, templateId: string, expected: EmailTemplateVersion) {
      const revision = expected?.revision;
      if (!Number.isSafeInteger(revision) || revision < 1 || revision >= Number.MAX_SAFE_INTEGER) {
        throw new EmailTemplateError('INVALID_TEMPLATE', 'expected.revision must be a positive safe integer.');
      }
      const { ObjectId: NativeObjectId } = this.requireNative();
      if (typeof expected.id !== 'string' || !/^[0-9a-f]{24}$/i.test(expected.id)) {
        throw new EmailTemplateError('INVALID_TEMPLATE', 'expected.id must be an email template override ID.');
      }
      return { _id: new NativeObjectId(expected.id), brandId, templateId, revision };
    }
  }
}

declare global {
  const EmailTemplateService: Services.EmailTemplates;
}
