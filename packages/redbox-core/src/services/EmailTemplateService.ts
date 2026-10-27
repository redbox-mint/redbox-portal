import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db, ObjectId } from 'mongodb';
import { handlebarsInstance, handlebarsPrecompile } from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import type { EmailTemplateAttributes } from '../waterline-models/EmailTemplate';

export type EmailTemplateErrorCode =
  | 'UNKNOWN_BRAND'
  | 'UNKNOWN_TEMPLATE'
  | 'MISSING_DEFAULT'
  | 'INVALID_TEMPLATE'
  | 'REVISION_CONFLICT'
  | 'PERSISTENCE'
  | 'RENDER_FAILED'
  | 'SANITISATION_FAILED'
  | 'LENGTH_LIMIT';

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
  constructor(brandId: string, templateId: string) {
    super('REVISION_CONFLICT', `Email template '${templateId}' for brand '${brandId}' changed; reload before editing.`);
    this.name = 'EmailTemplateConflictError';
  }
}

/**
 * Optimistic-concurrency token. Revisions restart when an override is reset and
 * recreated, so the row ID is part of the token: a stale token from an earlier
 * override lifetime can never match its replacement.
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
    subject: entry?.subject ?? config.defaults.subject,
    format: entry?.format ?? config.defaults.format,
  };
}

export interface EmailTemplateDiagnostic {
  field: 'subject' | 'body';
  reason: 'UNKNOWN_CONTEXT_ROOT' | 'UNKNOWN_HELPER' | 'UNSUPPORTED_CONSTRUCT' | 'INVALID_SYNTAX';
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

export function hardenEmailSubject(subject: string): string {
  validateEmailLength(subject, 'subject');
  // C0/C1 controls, CR/LF, DEL and Unicode line/paragraph separators.
  return Array.from(subject).filter(char => {
    const code = char.codePointAt(0)!;
    return code > 31 && !(code >= 127 && code <= 159) && code !== 0x2028 && code !== 0x2029;
  }).join('');
}

function validateExpressions(source: string, field: 'subject' | 'body'): void {
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
  visit(handlebars.parse(source), [{ certainRoot: true }], new Set());
}

/** DB content is schema-checked; supplied files retain hook-specific display roots. */
export function validateEmailTemplate(content: EmailTemplateContent, validateContext = true): void {
  if (!content || typeof content.subject !== 'string' || !content.subject.trim() ||
    typeof content.body !== 'string' || !content.body.trim() || !['html', 'text'].includes(content.format)) {
    throw new EmailTemplateError('INVALID_TEMPLATE', 'Email templates require non-empty subject/body and html or text format.');
  }
  for (const field of ['subject', 'body'] as const) {
    validateEmailLength(content[field], field);
    try {
      handlebarsPrecompile(content[field], { strict: true });
      if (validateContext) validateExpressions(content[field], field);
    } catch (error) {
      if (error instanceof EmailTemplateError) throw error;
      // Parser errors can include source excerpts. Keep only the location in public diagnostics.
      const location = (error as { hash?: { loc?: { first_line?: number; first_column?: number } } }).hash?.loc;
      const line = location?.first_line ?? 1;
      const column = (location?.first_column ?? 0) + 1;
      throw new EmailTemplateError('INVALID_TEMPLATE',
        `Email ${field}: INVALID_SYNTAX at line ${line}, column ${column}.`, undefined,
        { field, reason: 'INVALID_SYNTAX', line, column });
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

export namespace Services {
  export class EmailTemplates extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'bootstrap',
      'get',
      'list',
      'reportInvalidOverrides',
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
    }

    private async validateBrand(brandId: string): Promise<void> {
      if (typeof brandId !== 'string' || !brandId.trim()) {
        throw new EmailTemplateError('UNKNOWN_BRAND', 'An explicit, non-empty brand ID is required.');
      }
      const brand = await this.persist(() => BrandingConfig.findOne({ id: brandId }));
      if (!brand) throw new EmailTemplateError('UNKNOWN_BRAND', `Unknown email template brand '${brandId}'.`);
    }

    private async persist<T>(operation: () => PromiseLike<T>): Promise<T> {
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

    private validateStored(row: EmailTemplateAttributes, brandId: string, templateId: string): EmailTemplateAttributes {
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

    public async create(
      brandId: string,
      templateId: string,
      content: EmailTemplateContent,
      updatedBy?: string
    ): Promise<EmailTemplateAttributes> {
      await this.getDefault(brandId, templateId);
      validateEmailTemplate(content);
      return this.persist(async () => {
        try {
          return await EmailTemplate.create({
            brandId,
            templateId,
            uid: JSON.stringify([brandId, templateId]),
            subject: content.subject,
            body: content.body,
            format: content.format,
            revision: 1,
            updatedBy,
          }).fetch();
        } catch (error) {
          const code = (error as { code?: string | number }).code;
          if (code === 'E_UNIQUE' || code === 11000) throw new EmailTemplateConflictError(brandId, templateId);
          throw error;
        }
      });
    }

    public async update(
      brandId: string,
      templateId: string,
      content: EmailTemplateContent,
      expected: EmailTemplateVersion,
      updatedBy?: string
    ): Promise<EmailTemplateAttributes> {
      await this.getDefault(brandId, templateId);
      validateEmailTemplate(content);
      const criteria = this.versionCriteria(brandId, templateId, expected);
      const collection = this.collection();
      // sails-mongo's fetched Waterline updateOne first selects IDs, then
      // updates by ID alone, dropping the revision predicate. Use the native
      // atomic operation so the comparison and write cannot be separated.
      const row = await this.persist(() =>
        collection.findOneAndUpdate(
          criteria,
          {
            $set: {
              subject: content.subject,
              body: content.body,
              format: content.format,
              revision: expected.revision + 1,
              updatedAt: new Date().toISOString(),
              ...(updatedBy !== undefined ? { updatedBy } : {}),
            },
          },
          { returnDocument: 'after', includeResultMetadata: false }
        )
      );
      if (!row) throw new EmailTemplateConflictError(brandId, templateId);
      const { _id, ...attributes } = row;
      return this.validateStored({ ...attributes, id: String(_id) }, brandId, templateId);
    }

    /** expected=null creates (no override seen); a version token updates. Never blindly overwrites. */
    public async upsert(
      brandId: string,
      templateId: string,
      content: EmailTemplateContent,
      expected: EmailTemplateVersion | null,
      updatedBy?: string
    ): Promise<EmailTemplateAttributes> {
      return expected === null
        ? this.create(brandId, templateId, content, updatedBy)
        : this.update(brandId, templateId, content, expected, updatedBy);
    }

    public async reset(brandId: string, templateId: string, expected: EmailTemplateVersion): Promise<ResolvedEmailTemplate> {
      const suppliedDefault = await this.getDefault(brandId, templateId);
      const criteria = this.versionCriteria(brandId, templateId, expected);
      const collection = this.collection();
      const deleted = await this.persist(() => collection.deleteOne(criteria));
      if (deleted.deletedCount !== 1) throw new EmailTemplateConflictError(brandId, templateId);
      return suppliedDefault;
    }

    /**
     * Native handles from the model's own datastore. ObjectId must come from the
     * adapter's driver: sails-mongo bundles a different mongodb/bson major than
     * redbox-core, and the driver rejects foreign BSON types.
     */
    private native(): { db: Db; ObjectId: typeof ObjectId } | undefined {
      const datastore = EmailTemplate.getDatastore() as unknown as
        | { manager?: Db; driver?: { mongodb?: { ObjectId?: typeof ObjectId } } }
        | undefined;
      const db = datastore?.manager;
      const objectId = datastore?.driver?.mongodb?.ObjectId;
      return typeof db?.collection === 'function' && typeof objectId === 'function'
        ? { db, ObjectId: objectId }
        : undefined;
    }

    private requireNative() {
      const native = this.native();
      if (!native) {
        throw new EmailTemplateError(
          'PERSISTENCE',
          'Email template override writes require a native Mongo datastore.'
        );
      }
      return native;
    }

    private collection() {
      return this.requireNative().db.collection<Omit<EmailTemplateAttributes, 'id'> & { _id: ObjectId }>(
        EmailTemplate.tableName
      );
    }

    private versionCriteria(brandId: string, templateId: string, expected: EmailTemplateVersion) {
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
