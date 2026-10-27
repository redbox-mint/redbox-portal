import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db, ObjectId } from 'mongodb';
import { handlebarsPrecompile } from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import type { EmailTemplateAttributes } from '../waterline-models/EmailTemplate';

export type EmailTemplateErrorCode =
  | 'UNKNOWN_BRAND'
  | 'UNKNOWN_TEMPLATE'
  | 'MISSING_DEFAULT'
  | 'INVALID_TEMPLATE'
  | 'REVISION_CONFLICT'
  | 'PERSISTENCE'
  | 'RENDER_FAILED';

export class EmailTemplateError extends Error {
  constructor(
    public readonly code: EmailTemplateErrorCode,
    message: string,
    cause?: unknown
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
 * never attached as a cause: only its type and source position are kept.
 */
export function safeEmailTemplateError(
  code: EmailTemplateErrorCode,
  message: string,
  error: unknown
): EmailTemplateError {
  const source = (error ?? {}) as { name?: unknown; lineNumber?: unknown; column?: unknown; code?: unknown };
  const details = [
    typeof source.name === 'string' ? `type ${source.name}` : undefined,
    typeof source.code === 'string' || typeof source.code === 'number' ? `code ${source.code}` : undefined,
    typeof source.lineNumber === 'number' ? `line ${source.lineNumber}` : undefined,
    typeof source.column === 'number' ? `column ${source.column}` : undefined,
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

export function validateEmailTemplate(content: EmailTemplateContent): void {
  if (
    !content ||
    typeof content.subject !== 'string' ||
    !content.subject.trim() ||
    typeof content.body !== 'string' ||
    !content.body.trim() ||
    !['html', 'text'].includes(content.format)
  ) {
    throw new EmailTemplateError(
      'INVALID_TEMPLATE',
      'Email templates require non-empty subject/body and html or text format.'
    );
  }
  // compile() is lazy in Handlebars; precompile forces syntax validation without
  // inventing render data or rejecting valid strict-context expressions.
  for (const field of ['subject', 'body'] as const) {
    try {
      handlebarsPrecompile(content[field], { strict: true });
    } catch (error) {
      throw safeEmailTemplateError('INVALID_TEMPLATE', `Invalid Handlebars syntax in email template ${field}.`, error);
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
  validateEmailTemplate(result);
  return result;
}

export namespace Services {
  export class EmailTemplates extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'bootstrap',
      'get',
      'list',
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
