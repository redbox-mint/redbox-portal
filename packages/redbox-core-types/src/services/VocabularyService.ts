import { Services as services } from '../CoreService';
import { VocabularyAttributes, VocabularyEntryAttributes } from '../waterline-models';

export namespace Services {
  type VocabType = 'flat' | 'tree';
  type VocabSource = 'local' | 'rva';

  export interface VocabularyEntryInput {
    id?: string;
    label: string;
    value: string;
    parent?: string;
    identifier?: string;
    order?: number;
    children?: VocabularyEntryInput[];
  }

  export interface VocabularyInput {
    name: string;
    description?: string;
    type?: VocabType;
    source?: VocabSource;
    sourceId?: string;
    sourceVersionId?: string;
    lastSyncedAt?: string;
    slug?: string;
    owner?: string;
    branding: string;
    entries?: VocabularyEntryInput[];
  }

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

  export class Vocabulary extends services.Core.Service {
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

    private get vocabularyModel() {
      return (globalThis as Record<string, unknown>).Vocabulary as any;
    }

    private get vocabularyEntryModel() {
      return (globalThis as Record<string, unknown>).VocabularyEntry as any;
    }

    private resolveBrandingId(branding: unknown): string {
      if (branding && typeof branding === 'object') {
        const brandingObject = branding as { id?: string | number; _id?: string | number };
        if (brandingObject.id) {
          return String(brandingObject.id);
        }
        if (brandingObject._id) {
          return String(brandingObject._id);
        }
      }

      const brandingString = String(branding ?? '').trim();
      if (!brandingString) {
        return brandingString;
      }

      const servicesRegistry = globalThis as Record<string, unknown>;
      const brandingService = servicesRegistry.BrandingService as { getBrand?: (nameOrId: string) => { id?: string | number } | null } | undefined;
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

      const where: Record<string, unknown> = {};
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

      const total = await this.vocabularyModel.count(where);
      const data = await this.vocabularyModel.find(where).sort(sort).skip(offset).limit(limit);
      return { data, meta: { total, limit, offset } };
    }

    public async getById(id: string): Promise<VocabularyAttributes | null> {
      return await this.vocabularyModel.findOne({ id });
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

      const created = await this.vocabularyModel.create(createPayload).fetch();
      if (entries.length > 0) {
        await this.replaceEntries(created.id, created.type === 'flat', entries);
      }
      return (await this.vocabularyModel.findOne({ id: created.id })) as VocabularyAttributes;
    }

    public async update(id: string, input: Partial<VocabularyInput>): Promise<VocabularyAttributes> {
      const existing = await this.vocabularyModel.findOne({ id });
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
      await this.vocabularyModel.updateOne({ id }).set(modelUpdate);
      const updated = (await this.vocabularyModel.findOne({ id })) as VocabularyAttributes;

      if (entries) {
        await this.replaceEntries(id, updated.type === 'flat', entries);
      }

      return (await this.vocabularyModel.findOne({ id })) as VocabularyAttributes;
    }

    public async delete(id: string): Promise<void> {
      await this.vocabularyEntryModel.destroy({ vocabulary: id });
      await this.vocabularyModel.destroyOne({ id });
    }

    public normalizeEntry(entry: VocabularyEntryInput): VocabularyEntryInput {
      return {
        ...entry,
        label: String(entry.label ?? '').trim(),
        value: String(entry.value ?? '').trim()
      };
    }

    public async validateParent(vocabularyId: string, entryId: string | null, parentId: string | null): Promise<void> {
      if (!parentId) {
        return;
      }
      if (entryId && parentId === entryId) {
        throw new Error('VocabularyEntry cannot parent itself');
      }

      const parent = await this.vocabularyEntryModel.findOne({ id: parentId });
      if (!parent) {
        throw new Error('VocabularyEntry.parent not found');
      }
      if (String(parent.vocabulary) !== String(vocabularyId)) {
        throw new Error('VocabularyEntry.parent must belong to the same vocabulary');
      }

      if (!entryId) {
        return;
      }

      let cursor: VocabularyEntryAttributes | null = parent as VocabularyEntryAttributes;
      while (cursor?.parent) {
        if (String(cursor.parent) === entryId) {
          throw new Error('VocabularyEntry cycle detected');
        }
        cursor = (await this.vocabularyEntryModel.findOne({ id: String(cursor.parent) })) as VocabularyEntryAttributes | null;
      }
    }

    public async getTree(vocabularyId: string): Promise<VocabularyTreeNode[]> {
      const entries = (await this.vocabularyEntryModel.find({ vocabulary: vocabularyId }).sort('order ASC').sort('label ASC')) as VocabularyEntryAttributes[];
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

    public async upsertEntries(vocabularyId: string, entries: VocabularyEntryInput[]): Promise<{ created: number; updated: number; skipped: number }> {
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
          existing = (await this.vocabularyEntryModel.findOne({ vocabulary: vocabularyId, identifier: entry.identifier })) as VocabularyEntryAttributes | null;
        }
        if (!existing) {
          existing = (await this.vocabularyEntryModel.findOne({ vocabulary: vocabularyId, valueLower: entry.value.toLowerCase() })) as VocabularyEntryAttributes | null;
        }

        if (!existing) {
          await this.vocabularyEntryModel.create({
            vocabulary: vocabularyId,
            label: entry.label,
            value: entry.value,
            identifier: entry.identifier,
            order: entry.order ?? 0
          }).fetch();
          created++;
          continue;
        }

        await this.validateParent(vocabularyId, String(existing.id), entry.parent ?? null);
        await this.vocabularyEntryModel.updateOne({ id: existing.id }).set({
          label: entry.label,
          value: entry.value,
          identifier: entry.identifier,
          parent: entry.parent,
          order: entry.order ?? existing.order ?? 0
        });
        updated++;
      }

      return { created, updated, skipped };
    }

    private async replaceEntries(vocabularyId: string, isFlat: boolean, entries: VocabularyEntryInput[]): Promise<void> {
      const flatEntries = this.flattenEntries(entries);
      if (isFlat && flatEntries.some(entry => entry.parent)) {
        throw new Error('Vocabulary.type = flat does not support parent entries');
      }

      await this.vocabularyEntryModel.destroy({ vocabulary: vocabularyId });

      const oldToNewIds: Record<string, string> = {};
      for (const entry of flatEntries) {
        const normalized = this.normalizeEntry(entry);
        if (!normalized.label || !normalized.value) {
          throw new Error('VocabularyEntry.label and VocabularyEntry.value are required');
        }

        const created = await this.vocabularyEntryModel.create({
          vocabulary: vocabularyId,
          label: normalized.label,
          value: normalized.value,
          identifier: normalized.identifier,
          order: normalized.order ?? 0
        }).fetch();

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
        await this.validateParent(vocabularyId, entryId, mappedParentId);
        await this.vocabularyEntryModel.updateOne({ id: entryId }).set({ parent: mappedParentId });
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
  let VocabularyService: Services.Vocabulary;
}
