import { Services as services } from '../CoreService';
import { VocabularyAttributes, VocabularyEntryAttributes } from '../waterline-models';
import { runWithOptionalTransaction } from '../utilities/TransactionUtils';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export namespace Services {
  type VocabType = 'flat' | 'tree';
  type VocabSource = 'local' | 'rva';
  const VALID_TYPES = new Set<VocabType>(['flat', 'tree']);
  const VALID_SOURCES = new Set<VocabSource>(['local', 'rva']);
  const RVA_IMPORTS_FILE = 'rva-imports.json';
  const DEFAULT_BOOTSTRAP_DATA_PATH = 'bootstrap-data';
  const RVA_IMPORT_TIMEOUT_MS = 30_000;

  export type VocabularyEntryInput =
    Pick<VocabularyEntryAttributes, 'id' | 'label' | 'value' | 'identifier' | 'order' | 'historical'> & {
      parent?: string | null;
      children?: VocabularyEntryInput[];
    };

  export type VocabularyInput =
    Omit<Partial<VocabularyAttributes>, 'entries' | 'branding' | 'type' | 'source'> & {
      name: string;
      branding: string;
      type?: VocabType;
      source?: VocabSource;
      entries?: VocabularyEntryInput[];
    };

  export interface VocabularyListOptions {
    q?: string;
    type?: string;
    source?: string;
    limit?: number;
    offset?: number;
    sort?: string;
    branding?: string;
  }

  export interface VocabularyTreeNode extends VocabularyEntryAttributes {
    children: VocabularyTreeNode[];
  }

  export interface VocabularyEntriesOptions {
    search?: string;
    limit?: number;
    offset?: number;
  }

  export interface VocabularyEntriesResponse {
    entries: VocabularyEntryAttributes[];
    meta: {
      total: number;
      limit: number;
      offset: number;
      vocabularyId: string;
    };
  }

  export interface VocabularyChildrenNode {
    id: string;
    label: string;
    value: string;
    notation?: string;
    parent?: string | null;
    hasChildren: boolean;
  }

  export interface VocabularyChildrenResponse {
    entries: VocabularyChildrenNode[];
    meta: {
      vocabularyId: string;
      parentId: string | null;
      total: number;
    };
  }

  export class InvalidParentIdError extends Error {
    public readonly code: 'invalid-parent-id';

    constructor(message = 'Parent entry does not belong to the requested vocabulary') {
      super(message);
      this.name = 'InvalidParentIdError';
      this.code = 'invalid-parent-id';
    }
  }

  interface BootstrapVocabularyEntryInput {
    id?: unknown;
    label?: unknown;
    value?: unknown;
    identifier?: unknown;
    order?: unknown;
    historical?: unknown;
    parent?: unknown;
    children?: unknown;
  }

  interface BootstrapVocabularyFile {
    name?: unknown;
    slug?: unknown;
    description?: unknown;
    type?: unknown;
    entries?: unknown;
  }

  interface BootstrapRvaImportItem {
    rvaId?: unknown;
    versionId?: unknown;
  }

  interface BootstrapRvaImportsFile {
    imports?: unknown;
  }

  type VocabularyListWhere = {
    type?: VocabularyAttributes['type'];
    source?: VocabularyAttributes['source'];
    or?: Array<
      { name: { contains: string } } |
      { slug: { contains: string } }
    >;
  };

  export class VocabularyService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'list',
      'getById',
      'getByIdOrSlug',
      'getEntries',
      'getChildren',
      'bootstrapData',
      'create',
      'update',
      'reorderEntries',
      'delete',
      'getTree',
      'normalizeEntry',
      'validateParent',
      'upsertEntries'
    ];

    private async executeQuery<T>(query: Sails.WaterlinePromise<T>, connection?: Sails.Connection): Promise<T> {
      if (connection) {
        return query.usingConnection(connection);
      }
      return query;
    }

    private async executeFindQuery<T>(query: Sails.QueryBuilder, connection?: Sails.Connection): Promise<T> {
      if (connection) {
        return await query.usingConnection(connection) as T;
      }
      return await query as T;
    }

    private async createAndFetch<T>(createQuery: Sails.WaterlinePromise<T>, connection?: Sails.Connection): Promise<T> {
      const fetchedQuery = createQuery.fetch();
      return this.executeQuery(fetchedQuery, connection);
    }

    private resolveBrandingId(branding: unknown): string {
      if (branding && typeof branding === 'object') {
        const brandingObject = branding as { id?: string | number; _id?: string | number; name?: string };
        if (brandingObject.id) {
          return String(brandingObject.id);
        }
        if (brandingObject._id) {
          return String(brandingObject._id);
        }
        if (typeof brandingObject.name === 'string' && brandingObject.name.trim()) {
          return brandingObject.name.trim();
        }
        return '';
      }

      const brandingString = String(branding ?? '').trim();
      if (!brandingString) {
        return brandingString;
      }


      const globals = globalThis as { BrandingService?: { getBrand?: (nameOrId: string) => { id?: string | number } | null } };
      const brandingService = globals.BrandingService;
      const brand = brandingService?.getBrand?.(brandingString);
      if (brand?.id) {
        return String(brand.id);
      }

      return brandingString;
    }

    private toBoolean(value: unknown): boolean {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'number') {
        return value !== 0;
      }
      const normalized = String(value ?? '').trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
    }

    public async list(options: VocabularyListOptions): Promise<{ data: VocabularyAttributes[]; meta: { total: number; limit: number; offset: number } }> {
      const parsedLimit = Number.parseInt(String(options.limit ?? 25), 10);
      const parsedOffset = Number.parseInt(String(options.offset ?? 0), 10);
      const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(200, parsedLimit) : 25;
      const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
      const sort = options.sort || 'name ASC';

      const where: VocabularyListWhere = {};
      if (options.type && VALID_TYPES.has(options.type as VocabType)) {
        where.type = options.type as VocabularyAttributes['type'];
      }
      if (options.source && VALID_SOURCES.has(options.source as VocabSource)) {
        where.source = options.source as VocabularyAttributes['source'];
      }
      // Branding is single-tenant for this admin feature; avoid ObjectId/string mismatch
      // filtering at query time which can hide records in Mongo-backed environments.
      if (options.q) {
        where.or = [
          { name: { contains: options.q } },
          { slug: { contains: options.q } }
        ];
      }

      const total = await Vocabulary.count(where);
      const data = await Vocabulary.find(where).sort(sort).skip(offset).limit(limit) as VocabularyAttributes[];
      return { data, meta: { total, limit, offset } };
    }

    public async getById(id: string): Promise<VocabularyAttributes | null> {
      return await Vocabulary.findOne({ id });
    }

    public async getByIdOrSlug(branding: string, idOrSlug: string): Promise<VocabularyAttributes | null> {
      const normalizedBranding = this.resolveBrandingId(branding);
      const normalizedIdOrSlug = String(idOrSlug ?? '').trim();
      if (!normalizedBranding || !normalizedIdOrSlug) {
        return null;
      }

      const byId = await Vocabulary.findOne({ id: normalizedIdOrSlug, branding: normalizedBranding }) as VocabularyAttributes | null;
      if (byId) {
        return byId;
      }
      return await Vocabulary.findOne({ slug: normalizedIdOrSlug, branding: normalizedBranding }) as VocabularyAttributes | null;
    }

    public async getEntries(
      branding: string,
      vocabIdOrSlug: string,
      options?: VocabularyEntriesOptions
    ): Promise<VocabularyEntriesResponse | null> {
      const vocabulary = await this.getByIdOrSlug(branding, vocabIdOrSlug);
      if (!vocabulary) {
        return null;
      }

      const parsedLimit = Number.parseInt(String(options?.limit ?? 200), 10);
      const parsedOffset = Number.parseInt(String(options?.offset ?? 0), 10);
      const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(1000, parsedLimit) : 200;
      const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
      const search = String(options?.search ?? '').trim().toLowerCase();

      const where: { vocabulary: string; labelLower?: { contains: string } } = {
        vocabulary: String(vocabulary.id)
      };
      if (search) {
        where.labelLower = { contains: search };
      }

      const total = await VocabularyEntry.count(where);
      const entries = await VocabularyEntry.find(where)
        .sort('order ASC')
        .sort('label ASC')
        .skip(offset)
        .limit(limit) as VocabularyEntryAttributes[];

      return {
        entries,
        meta: {
          total,
          limit,
          offset,
          vocabularyId: String(vocabulary.id)
        }
      };
    }

    public async getChildren(
      branding: string,
      vocabIdOrSlug: string,
      parentId?: string | null
    ): Promise<VocabularyChildrenResponse | null> {
      const vocabulary = await this.getByIdOrSlug(branding, vocabIdOrSlug);
      if (!vocabulary) {
        return null;
      }

      const normalizedParentId = String(parentId ?? '').trim();
      if (normalizedParentId) {
        const parentEntry = await VocabularyEntry.findOne({
          id: normalizedParentId,
          vocabulary: String(vocabulary.id)
        }) as VocabularyEntryAttributes | null;
        if (!parentEntry) {
          throw new InvalidParentIdError();
        }
      }

      const where: { vocabulary: string; parent?: string | null } = {
        vocabulary: String(vocabulary.id),
      };
      where.parent = normalizedParentId || null;

      const entries = await VocabularyEntry.find(where)
        .sort('order ASC')
        .sort('label ASC') as VocabularyEntryAttributes[];

      const childParentIds = entries.map((entry) => String(entry.id));
      const hasChildrenById = new Map<string, boolean>();

      if (childParentIds.length > 0) {
        const descendants = await VocabularyEntry.find({
          vocabulary: String(vocabulary.id),
          parent: { in: childParentIds }
        }) as VocabularyEntryAttributes[];

        for (const descendant of descendants) {
          const descendantParent = String(descendant.parent ?? '');
          if (descendantParent) {
            hasChildrenById.set(descendantParent, true);
          }
        }
      }

      const responseEntries: VocabularyChildrenNode[] = entries.map((entry) => {
        const id = String(entry.id);
        const parent = entry.parent ? String(entry.parent) : null;
        const notation = String(entry.identifier ?? '').trim() || String(entry.value ?? '').trim();
        return {
          id,
          label: String(entry.label ?? ''),
          value: String(entry.value ?? ''),
          notation: notation || undefined,
          parent,
          hasChildren: hasChildrenById.get(id) === true
        };
      });

      return {
        entries: responseEntries,
        meta: {
          vocabularyId: String(vocabulary.id),
          parentId: normalizedParentId || null,
          total: responseEntries.length
        }
      };
    }

    public async create(input: VocabularyInput): Promise<VocabularyAttributes> {
      const payload: VocabularyInput = {
        ...input,
        type: input.type ?? 'flat',
        source: input.source ?? 'local'
      };

      const entries = payload.entries ?? [];
      delete payload.entries;

      const createPayload: Partial<VocabularyAttributes> = {
        name: payload.name,
        description: payload.description,
        type: payload.type,
        source: payload.source,
        sourceId: payload.sourceId,
        sourceVersionId: payload.sourceVersionId,
        lastSyncedAt: payload.lastSyncedAt,
        owner: payload.owner,
        branding: this.resolveBrandingId(payload.branding)
      };
      if (payload.slug) {
        createPayload.slug = payload.slug;
      }

      return runWithOptionalTransaction(
        this.getDatastore(),
        async (connection) => {
          let created: VocabularyAttributes | null = null;
          try {
            created = await this.createAndFetch<VocabularyAttributes>(
              Vocabulary.create(createPayload),
              connection
            );
            if (!created) {
              throw new Error('Vocabulary create failed');
            }
            if (entries.length > 0) {
              await this.replaceEntries(created.id, created.type === 'flat', entries, connection);
            }
            const findQuery = Vocabulary.findOne({ id: created.id }) as Sails.WaterlinePromise<VocabularyAttributes | null>;
            const saved = await this.executeQuery(findQuery, connection);
            if (!saved) {
              throw new Error('Vocabulary create failed');
            }
            return saved;
          } catch (err) {
            if (!connection && created?.id) {
              try {
                await VocabularyEntry.destroy({ vocabulary: created.id });
                await Vocabulary.destroyOne({ id: created.id });
              } catch (_cleanupErr) {
                // Swallow cleanup errors to preserve the original failure.
              }
            }
            throw err;
          }
        },
        {
          logger: sails.log,
          unsupportedAdapterWarning: 'Transactions are not supported by this datastore adapter. Falling back to non-transactional create.'
        }
      );
    }

    public async bootstrapData(): Promise<void> {
      const bootstrapPath = this.getBootstrapDataPath();
      let fileNames: string[] = [];
      const fileOps = this.getBootstrapFileOps();

      try {
        const fileEntries = await fileOps.readdir(bootstrapPath, { withFileTypes: true });
        fileNames = fileEntries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b));
      } catch (error) {
        const ioError = error as NodeJS.ErrnoException;
        if (ioError.code === 'ENOENT') {
          sails.log.verbose(`Vocabulary bootstrap data path not found: ${bootstrapPath}`);
          return;
        }
        sails.log.error(`Failed to read vocabulary bootstrap data path: ${bootstrapPath}`, error);
        return;
      }

      const defaultBranding = this.resolveBrandingId(
        sails.services.brandingservice.getDefault?.() ?? sails.config?.auth?.defaultBrand ?? 'default'
      );
      if (!defaultBranding) {
        sails.log.error('Unable to resolve default branding for vocabulary bootstrap data');
        return;
      }

      for (const fileName of fileNames) {
        if (fileName === RVA_IMPORTS_FILE) {
          await this.processRvaImportsFile(bootstrapPath, fileName, defaultBranding);
          continue;
        }
        await this.processVocabularyBootstrapFile(bootstrapPath, fileName, defaultBranding);
      }
    }

    public async update(id: string, input: Partial<VocabularyInput>): Promise<VocabularyAttributes> {
      const existing = await Vocabulary.findOne({ id });
      if (!existing) {
        throw new Error('Vocabulary not found');
      }

      const updatePayload: Partial<VocabularyInput> = { ...input };
      const entries = updatePayload.entries;
      delete updatePayload.entries;

      const modelUpdate: Partial<VocabularyAttributes> = {
        name: updatePayload.name,
        description: updatePayload.description,
        type: updatePayload.type,
        source: updatePayload.source,
        sourceId: updatePayload.sourceId,
        sourceVersionId: updatePayload.sourceVersionId,
        lastSyncedAt: updatePayload.lastSyncedAt,
        owner: updatePayload.owner
      };
      if (typeof updatePayload.branding !== 'undefined') {
        modelUpdate.branding = this.resolveBrandingId(updatePayload.branding);
      }
      if (typeof updatePayload.slug !== 'undefined') {
        modelUpdate.slug = updatePayload.slug;
      }

      return runWithOptionalTransaction(
        this.getDatastore(),
        async (connection) => {
          const updateQuery = Vocabulary.updateOne({ id }).set(modelUpdate) as Sails.WaterlinePromise<VocabularyAttributes | null>;
          await this.executeQuery(updateQuery, connection);
          const updatedQuery = Vocabulary.findOne({ id }) as Sails.WaterlinePromise<VocabularyAttributes | null>;
          const updated = await this.executeQuery(updatedQuery, connection);
          if (!updated) {
            throw new Error('Vocabulary not found');
          }

          if (entries) {
            await this.replaceEntries(id, updated.type === 'flat', entries, connection);
          }

          const refreshedQuery = Vocabulary.findOne({ id }) as Sails.WaterlinePromise<VocabularyAttributes | null>;
          const refreshed = await this.executeQuery(refreshedQuery, connection);
          if (!refreshed) {
            throw new Error('Vocabulary not found');
          }
          return refreshed;
        },
        {
          logger: sails.log,
          unsupportedAdapterWarning: 'Transactions are not supported by this datastore adapter. Falling back to non-transactional update.'
        }
      );
    }

    public async reorderEntries(vocabularyId: string, entryOrders: Array<{ id: string; order: number }>): Promise<number> {
      if (!Array.isArray(entryOrders) || entryOrders.length === 0) {
        return 0;
      }

      return runWithOptionalTransaction(
        this.getDatastore(),
        async (connection) => {
          const vocabularyQuery = Vocabulary.findOne({ id: vocabularyId }) as Sails.WaterlinePromise<VocabularyAttributes | null>;
          const vocabulary = await this.executeQuery(vocabularyQuery, connection);
          if (!vocabulary) {
            throw new Error('Vocabulary not found');
          }

          const requestedIds = entryOrders.map((entry) => String(entry.id));
          const dedupedIds = new Set(requestedIds);
          if (requestedIds.length !== dedupedIds.size) {
            throw new Error('entryOrders contains duplicate ids');
          }

          const existingQuery = VocabularyEntry.find({ id: Array.from(dedupedIds) });
          const existingEntries = await this.executeFindQuery<VocabularyEntryAttributes[]>(existingQuery, connection);
          if (existingEntries.length !== dedupedIds.size) {
            throw new Error('One or more entry ids were not found');
          }

          for (const entry of existingEntries) {
            if (String(entry.vocabulary) !== String(vocabularyId)) {
              throw new Error('All entries must belong to the target vocabulary');
            }
          }

          let updated = 0;
          for (const entryOrder of entryOrders) {
            const updateQuery = VocabularyEntry.updateOne({ id: entryOrder.id }).set({ order: entryOrder.order }) as Sails.WaterlinePromise<VocabularyEntryAttributes | null>;
            const updatedEntry = await this.executeQuery(updateQuery, connection);
            if (updatedEntry) {
              updated++;
            }
          }

          return updated;
        },
        {
          logger: sails.log,
          unsupportedAdapterWarning: 'Transactions are not supported by this datastore adapter. Falling back to non-transactional reorder.'
        }
      );
    }

    public async delete(id: string): Promise<void> {
      await VocabularyEntry.destroy({ vocabulary: id });
      await Vocabulary.destroyOne({ id });
    }

    public normalizeEntry(entry: VocabularyEntryInput): VocabularyEntryInput {
      return {
        ...entry,
        label: String(entry.label ?? '').trim(),
        value: String(entry.value ?? '').trim(),
        historical: this.toBoolean(entry.historical)
      };
    }

    public async validateParent(vocabularyId: string, entryId: string | null, parentId: string | null, connection?: Sails.Connection): Promise<void> {
      if (!parentId) {
        return;
      }
      if (entryId && parentId === entryId) {
        throw new Error('VocabularyEntry cannot parent itself');
      }

      const parentQuery = VocabularyEntry.findOne({ id: parentId }) as Sails.WaterlinePromise<VocabularyEntryAttributes | null>;
      const parent = await this.executeQuery<VocabularyEntryAttributes | null>(parentQuery, connection);
      if (!parent) {
        throw new Error('VocabularyEntry.parent not found');
      }
      if (String(parent.vocabulary) !== String(vocabularyId)) {
        throw new Error('VocabularyEntry.parent must belong to the same vocabulary');
      }

      if (!entryId) {
        return;
      }

      let cursor: VocabularyEntryAttributes | null = parent;
      while (cursor?.parent) {
        if (String(cursor.parent) === entryId) {
          throw new Error('VocabularyEntry cycle detected');
        }
        const cursorQuery = VocabularyEntry.findOne({ id: String(cursor.parent) }) as Sails.WaterlinePromise<VocabularyEntryAttributes | null>;
        cursor = await this.executeQuery(cursorQuery, connection);
      }
    }

    public async getTree(vocabularyId: string): Promise<VocabularyTreeNode[]> {
      const entries = await VocabularyEntry.find({ vocabulary: vocabularyId }).sort('order ASC').sort('label ASC') as VocabularyEntryAttributes[];
      const nodes: Record<string, VocabularyTreeNode> = {};
      const roots: VocabularyTreeNode[] = [];

      for (const entry of entries) {
        const node: VocabularyTreeNode = {
          ...entry,
          children: []
        };
        nodes[String(entry.id)] = node;
      }

      for (const entry of entries) {
        const node = nodes[String(entry.id)];
        if (entry.parent && nodes[String(entry.parent)]) {
          nodes[String(entry.parent)].children.push(node);
        } else {
          roots.push(node);
        }
      }

      return roots;
    }

    public async upsertEntries(vocabularyId: string, entries: VocabularyEntryInput[], connection?: Sails.Connection): Promise<{ created: number; updated: number; skipped: number }> {
      let created = 0;
      let updated = 0;
      let skipped = 0;
      const inputIdToEntryId: Record<string, string> = {};
      const parentAssignments: Array<{ entryId: string; parent: string | null }> = [];

      for (const rawEntry of entries) {
        const entry = this.normalizeEntry(rawEntry);
        if (!entry.label || !entry.value) {
          skipped++;
          continue;
        }

        let existing: VocabularyEntryAttributes | null = null;
        if (entry.identifier) {
          const byIdentifier = VocabularyEntry.findOne({ vocabulary: vocabularyId, identifier: entry.identifier }) as Sails.WaterlinePromise<VocabularyEntryAttributes | null>;
          existing = await this.executeQuery(byIdentifier, connection);
        }
        if (!existing) {
          const byValue = VocabularyEntry.findOne({ vocabulary: vocabularyId, valueLower: entry.value.toLowerCase() }) as Sails.WaterlinePromise<VocabularyEntryAttributes | null>;
          existing = await this.executeQuery(byValue, connection);
        }

        if (!existing) {
          const createQuery = VocabularyEntry.create({
            vocabulary: vocabularyId,
            label: entry.label,
            value: entry.value,
            identifier: entry.identifier,
            order: entry.order ?? 0,
            historical: entry.historical ?? false
          });
          const createdEntry = await this.createAndFetch<VocabularyEntryAttributes>(createQuery, connection);
          const createdEntryId = String(createdEntry.id);
          if (entry.id) {
            inputIdToEntryId[String(entry.id)] = createdEntryId;
          }
          parentAssignments.push({ entryId: createdEntryId, parent: entry.parent ?? null });
          created++;
          continue;
        }

        const existingEntryId = String(existing.id);
        if (entry.id) {
          inputIdToEntryId[String(entry.id)] = existingEntryId;
        }
        parentAssignments.push({ entryId: existingEntryId, parent: entry.parent ?? null });
        const updateQuery = VocabularyEntry.updateOne({ id: existing.id }).set({
          label: entry.label,
          value: entry.value,
          identifier: entry.identifier,
          order: entry.order ?? existing.order ?? 0,
          historical: entry.historical ?? existing.historical ?? false
        }) as Sails.WaterlinePromise<VocabularyEntryAttributes | null>;
        await this.executeQuery(updateQuery, connection);
        updated++;
      }

      for (const assignment of parentAssignments) {
        const parentCandidate = assignment.parent ? inputIdToEntryId[assignment.parent] ?? assignment.parent : null;
        await this.validateParent(vocabularyId, assignment.entryId, parentCandidate, connection);
        const parentUpdateQuery = VocabularyEntry.updateOne({ id: assignment.entryId }).set({
          parent: parentCandidate ?? null
        }) as Sails.WaterlinePromise<VocabularyEntryAttributes | null>;
        await this.executeQuery(parentUpdateQuery, connection);
      }

      return { created, updated, skipped };
    }

    private async replaceEntries(vocabularyId: string, isFlat: boolean, entries: VocabularyEntryInput[], connection?: Sails.Connection): Promise<void> {
      const flatEntries = this.flattenEntries(entries);
      if (isFlat && flatEntries.some(entry => entry.parent)) {
        throw new Error('Vocabulary.type = flat does not support parent entries');
      }

      const destroyQuery = VocabularyEntry.destroy({ vocabulary: vocabularyId }) as Sails.WaterlinePromise<unknown[]>;
      await this.executeQuery(destroyQuery, connection);

      const oldToNewIds: Record<string, string> = {};
      for (const entry of flatEntries) {
        const normalized = this.normalizeEntry(entry);
        if (!normalized.label || !normalized.value) {
          throw new Error('VocabularyEntry.label and VocabularyEntry.value are required');
        }

        const createQuery = VocabularyEntry.create({
          vocabulary: vocabularyId,
          label: normalized.label,
          value: normalized.value,
          identifier: normalized.identifier,
          order: normalized.order ?? 0,
          historical: normalized.historical ?? false
        });
        const created = await this.createAndFetch<VocabularyEntryAttributes>(createQuery, connection);

        oldToNewIds[String(normalized.id)] = String(created.id);
      }

      for (const entry of flatEntries) {
        if (!entry.parent) {
          continue;
        }
        const entryId = oldToNewIds[String(entry.id)];
        const mappedParentId = oldToNewIds[entry.parent] ?? entry.parent;
        if (!entryId) {
          continue;
        }
        await this.validateParent(vocabularyId, entryId, mappedParentId, connection);
        const updateQuery = VocabularyEntry.updateOne({ id: entryId }).set({ parent: mappedParentId }) as Sails.WaterlinePromise<VocabularyEntryAttributes | null>;
        await this.executeQuery(updateQuery, connection);
      }
    }

    private getDatastore(): Sails.Datastore | null {
      return Vocabulary.getDatastore?.()
        ?? sails.getDatastore?.()
        ?? null;
    }

    private getBootstrapDataPath(): string {
      const configuredPath = _.get(sails.config, 'bootstrap.bootstrapDataPath', DEFAULT_BOOTSTRAP_DATA_PATH);
      return path.resolve(String(configuredPath), 'vocabularies');
    }

    protected getBootstrapFileOps(): Pick<typeof fs, 'readdir' | 'readFile'> {
      return fs;
    }

    private async processVocabularyBootstrapFile(basePath: string, fileName: string, defaultBranding: string): Promise<void> {
      const filePath = path.join(basePath, fileName);
      const parsed = await this.readJsonFile<BootstrapVocabularyFile>(filePath);
      if (!parsed) {
        return;
      }

      const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
      const slug = typeof parsed.slug === 'string' ? parsed.slug.trim() : '';
      if (!name || !slug) {
        sails.log.error(`Skipping vocabulary bootstrap file with missing name or slug: ${fileName}`);
        return;
      }

      const existing = await Vocabulary.findOne({ slug, branding: defaultBranding }) as VocabularyAttributes | null;
      if (existing) {
        sails.log.verbose(`Skipping existing vocabulary bootstrap data: ${slug}`);
        return;
      }

      const createPayload: VocabularyInput = {
        name,
        slug,
        branding: defaultBranding
      };

      if (typeof parsed.description === 'string') {
        createPayload.description = parsed.description;
      }

      if (typeof parsed.type === 'string' && VALID_TYPES.has(parsed.type as VocabType)) {
        createPayload.type = parsed.type as VocabType;
      }

      const entries = this.toBootstrapEntries(parsed.entries);
      if (entries.length > 0) {
        createPayload.entries = entries;
      }

      try {
        const created = await this.create(createPayload);
        sails.log.verbose(`Created vocabulary bootstrap data: ${slug} (${String(created.id)})`);
      } catch (error) {
        sails.log.error(`Failed to create vocabulary from bootstrap file: ${fileName}`, error);
      }
    }

    private async processRvaImportsFile(basePath: string, fileName: string, defaultBranding: string): Promise<void> {
      if (_.get(sails.config, 'vocab.bootstrapRvaImports') === false) {
        sails.log.verbose(`Skipping RVA imports bootstrap file (disabled): ${fileName}`);
        return;
      }

      const filePath = path.join(basePath, fileName);
      const parsed = await this.readJsonFile<BootstrapRvaImportsFile>(filePath);
      if (!parsed) {
        return;
      }

      const imports = Array.isArray(parsed.imports) ? parsed.imports as BootstrapRvaImportItem[] : [];
      if (!Array.isArray(parsed.imports)) {
        sails.log.error(`Invalid RVA imports format in bootstrap file: ${fileName}`);
        return;
      }

      const rvaImportService = sails.services.rvaimportservice as {
        importRvaVocabulary: (rvaId: string, versionId?: string, branding?: string) => Promise<VocabularyAttributes>;
      } | undefined;
      if (!rvaImportService?.importRvaVocabulary) {
        sails.log.error('RVA import service unavailable while processing vocabulary bootstrap data');
        return;
      }

      for (const item of imports) {
        const rvaId = typeof item?.rvaId === 'string' ? item.rvaId.trim() : String(item?.rvaId ?? '').trim();
        if (!rvaId) {
          sails.log.error(`Skipping RVA bootstrap import with missing rvaId in ${fileName}`);
          continue;
        }

        const sourceKey = `rva:${rvaId}`;
        const existing = await Vocabulary.findOne({ rvaSourceKey: sourceKey }) as VocabularyAttributes | null;
        if (existing) {
          sails.log.verbose(`Skipping existing RVA bootstrap import: ${sourceKey}`);
          continue;
        }

        const versionId = typeof item?.versionId === 'string' ? item.versionId.trim() : undefined;

        try {
          await this.promiseWithTimeout(
            rvaImportService.importRvaVocabulary(rvaId, versionId, defaultBranding),
            RVA_IMPORT_TIMEOUT_MS,
            `RVA import ${sourceKey}`
          );
          sails.log.verbose(`Imported RVA bootstrap vocabulary: ${sourceKey}`);
        } catch (error) {
          sails.log.error(`Failed RVA bootstrap import: ${sourceKey}`, error);
        }
      }
    }

    private async readJsonFile<T>(filePath: string): Promise<T | null> {
      try {
        const content = await this.getBootstrapFileOps().readFile(filePath, 'utf8');
        return JSON.parse(content) as T;
      } catch (error) {
        sails.log.error(`Failed to read vocabulary bootstrap file: ${path.basename(filePath)}`, error);
        return null;
      }
    }

    private toBootstrapEntries(entries: unknown): VocabularyEntryInput[] {
      if (!Array.isArray(entries)) {
        return [];
      }

      return entries.map((entry, index) => this.toBootstrapEntry(entry, index, 'bootstrap'));
    }

    private toBootstrapEntry(rawEntry: unknown, index: number, branch: string): VocabularyEntryInput {
      const entry = (rawEntry && typeof rawEntry === 'object')
        ? rawEntry as BootstrapVocabularyEntryInput
        : {};

      const generatedId = typeof entry.id !== 'undefined' ? String(entry.id) : `${branch}-${index}`;
      const normalized: VocabularyEntryInput = {
        id: generatedId,
        label: String(entry.label ?? '').trim(),
        value: String(entry.value ?? '').trim(),
        order: typeof entry.order === 'number' ? entry.order : index,
        historical: typeof entry.historical === 'undefined' ? false : this.toBoolean(entry.historical)
      };

      if (typeof entry.identifier === 'string' && entry.identifier.trim()) {
        normalized.identifier = entry.identifier.trim();
      }
      if (typeof entry.parent !== 'undefined' && entry.parent !== null) {
        normalized.parent = String(entry.parent);
      }
      if (Array.isArray(entry.children)) {
        normalized.children = entry.children.map((child, childIndex) => this.toBootstrapEntry(child, childIndex, generatedId));
      }
      return normalized;
    }

    private async promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
      let timeoutHandle: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      try {
        return await Promise.race([promise, timeoutPromise]);
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      }
    }

    private flattenEntries(entries: VocabularyEntryInput[], parentId: string | null = null, branch: string = 'n'): VocabularyEntryInput[] {
      const flat: VocabularyEntryInput[] = [];
      entries.forEach((entry, index) => {
        const generatedId = entry.id ?? `${branch}-${index}`;
        const normalized: VocabularyEntryInput = {
          ...entry,
          id: generatedId,
          order: entry.order ?? index,
          parent: parentId ?? entry.parent
        };
        flat.push(normalized);
        if (entry.children && entry.children.length > 0) {
          flat.push(...this.flattenEntries(entry.children, generatedId, generatedId));
        }
      });
      return flat;
    }
  }

}

declare global {
  let VocabularyService: Services.VocabularyService;
}
