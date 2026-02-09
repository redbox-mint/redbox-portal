import { Services as services } from '../CoreService';
import { VocabularyAttributes, VocabularyEntryAttributes } from '../waterline-models';

export namespace Services {
  type VocabType = 'flat' | 'tree';
  type VocabSource = 'local' | 'rva';

  export type VocabularyEntryInput =
    Pick<VocabularyEntryAttributes, 'id' | 'label' | 'value' | 'identifier' | 'order'> & {
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
      'create',
      'update',
      'delete',
      'getTree',
      'normalizeEntry',
      'validateParent',
      'upsertEntries'
    ];

    private async executeQuery<T>(query: Sails.WaterlinePromise<T>, connection?: unknown): Promise<T> {
      if (connection) {
        return query.usingConnection(connection);
      }
      return query;
    }

    private async createAndFetch<T>(createQuery: Sails.WaterlinePromise<T>, connection?: unknown): Promise<T> {
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


      const brandingService = BrandingService as { getBrand?: (nameOrId: string) => { id?: string | number } | null } | undefined;
      const brand = brandingService?.getBrand?.(brandingString);
      if (brand?.id) {
        return String(brand.id);
      }

      return brandingString;
    }

    public async list(options: VocabularyListOptions): Promise<{ data: VocabularyAttributes[]; meta: { total: number; limit: number; offset: number } }> {
      const limit = Math.max(1, Math.min(200, Number(options.limit ?? 25)));
      const offset = Math.max(0, Number(options.offset ?? 0));
      const sort = options.sort || 'name ASC';

      const where: VocabularyListWhere = {};
      if (options.type) {
        where.type = options.type;
      }
      if (options.source) {
        where.source = options.source;
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

      const datastore = this.getDatastore();
      if (datastore?.transaction) {
        try {
          return await datastore.transaction(async (connection: unknown) => {
            const created = await this.createAndFetch<VocabularyAttributes>(
              Vocabulary.create(createPayload),
              connection
            );
            if (entries.length > 0) {
              await this.replaceEntries(created.id, created.type === 'flat', entries, connection);
            }
            const findQuery = Vocabulary.findOne({ id: created.id }) as Sails.WaterlinePromise<VocabularyAttributes | null>;
            const found = await this.executeQuery(findQuery, connection);
            if (!found) {
              throw new Error('Vocabulary create failed');
            }
            return found;
          });
        } catch (error) {
          const message = String((error as Error)?.message ?? error);
          if (!(message.includes('transactional') && message.includes('adapter'))) {
            throw error;
          }
          sails.log?.warn?.('Transactions are not supported by this datastore adapter. Falling back to non-transactional create.');
        }
      }

      let created: VocabularyAttributes | null = null;
      try {
        created = await this.createAndFetch<VocabularyAttributes>(
          Vocabulary.create(createPayload)
        );
        if (!created) {
          throw new Error('Vocabulary create failed');
        }
        if (entries.length > 0) {
          await this.replaceEntries(created.id, created.type === 'flat', entries);
        }
        const saved = await Vocabulary.findOne({ id: created.id });
        if (!saved) {
          throw new Error('Vocabulary create failed');
        }
        return saved;
      } catch (err) {
        if (created?.id) {
          try {
            await VocabularyEntry.destroy({ vocabulary: created.id });
            await Vocabulary.destroyOne({ id: created.id });
          } catch (_cleanupErr) {
            // Swallow cleanup errors to preserve the original failure.
          }
        }
        throw err;
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
      await Vocabulary.updateOne({ id }).set(modelUpdate);
      const updated = await Vocabulary.findOne({ id });
      if (!updated) {
        throw new Error('Vocabulary not found');
      }

      if (entries) {
        await this.replaceEntries(id, updated.type === 'flat', entries);
      }

      const refreshed = await Vocabulary.findOne({ id });
      if (!refreshed) {
        throw new Error('Vocabulary not found');
      }
      return refreshed;
    }

    public async delete(id: string): Promise<void> {
      await VocabularyEntry.destroy({ vocabulary: id });
      await Vocabulary.destroyOne({ id });
    }

    public normalizeEntry(entry: VocabularyEntryInput): VocabularyEntryInput {
      return {
        ...entry,
        label: String(entry.label ?? '').trim(),
        value: String(entry.value ?? '').trim()
      };
    }

    public async validateParent(vocabularyId: string, entryId: string | null, parentId: string | null, connection?: unknown): Promise<void> {
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

    public async upsertEntries(vocabularyId: string, entries: VocabularyEntryInput[], connection?: unknown): Promise<{ created: number; updated: number; skipped: number }> {
      let created = 0;
      let updated = 0;
      let skipped = 0;

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
          await this.validateParent(vocabularyId, null, entry.parent ?? null, connection);
          const createQuery = VocabularyEntry.create({
            vocabulary: vocabularyId,
            label: entry.label,
            value: entry.value,
            identifier: entry.identifier,
            parent: entry.parent ?? undefined,
            order: entry.order ?? 0
          });
          await this.createAndFetch<VocabularyEntryAttributes>(createQuery, connection);
          created++;
          continue;
        }

        await this.validateParent(vocabularyId, String(existing.id), entry.parent ?? null, connection);
        const updateQuery = VocabularyEntry.updateOne({ id: existing.id }).set({
          label: entry.label,
          value: entry.value,
          identifier: entry.identifier,
          parent: entry.parent ?? undefined,
          order: entry.order ?? existing.order ?? 0
        }) as Sails.WaterlinePromise<VocabularyEntryAttributes | null>;
        await this.executeQuery(updateQuery, connection);
        updated++;
      }

      return { created, updated, skipped };
    }

    private async replaceEntries(vocabularyId: string, isFlat: boolean, entries: VocabularyEntryInput[], connection?: unknown): Promise<void> {
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
          order: normalized.order ?? 0
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

    private getDatastore(): { transaction?: <T>(cb: (db: unknown) => Promise<T>) => Promise<T> } | null {
      return (Vocabulary.getDatastore?.() as { transaction?: <T>(cb: (db: unknown) => Promise<T>) => Promise<T> } | null)
        ?? (sails as { getDatastore?: () => { transaction?: <T>(cb: (db: unknown) => Promise<T>) => Promise<T> } | null }).getDatastore?.()
        ?? null;
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
