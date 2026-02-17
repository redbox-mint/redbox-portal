/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, BelongsTo, Entity, HasMany, toWaterlineModelDef } from '../decorators';
import type { BrandingConfigAttributes } from './BrandingConfig';
import type { VocabularyEntryAttributes } from './VocabularyEntry';

const VALID_TYPES = new Set(['flat', 'tree']);
const VALID_SOURCES = new Set(['local', 'rva']);

const slugify = (value: string): string => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/-\d{6,}$/g, '')
  .replace(/^-+|-+$/g, '')
  .replace(/--+/g, '-');

const normalize = (record: Record<string, unknown>, isCreate: boolean): void => {
  const hasName = typeof record.name !== 'undefined';
  const name = hasName ? String(record.name ?? '').trim() : '';
  if (isCreate && !name) {
    throw new Error('Vocabulary.name is required');
  }
  if (hasName && !name) {
    throw new Error('Vocabulary.name is required');
  }
  if (hasName) {
    record.name = name;
  }

  const hasType = typeof record.type !== 'undefined';
  const type = String((hasType ? record.type : (isCreate ? 'flat' : undefined)) ?? '').toLowerCase();
  if (type) {
    if (!VALID_TYPES.has(type)) {
      throw new Error(`Vocabulary.type must be one of: ${Array.from(VALID_TYPES).join(', ')}`);
    }
    record.type = type;
  }

  const hasSource = typeof record.source !== 'undefined';
  const source = String((hasSource ? record.source : (isCreate ? 'local' : undefined)) ?? '').toLowerCase();
  if (source) {
    if (!VALID_SOURCES.has(source)) {
      throw new Error(`Vocabulary.source must be one of: ${Array.from(VALID_SOURCES).join(', ')}`);
    }
    record.source = source;
  }

  const hasSlug = typeof record.slug !== 'undefined';
  if (hasSlug || hasName || isCreate) {
    const rawSlug = hasSlug ? String(record.slug).trim() : '';
    const slugSource = rawSlug && rawSlug !== '__AUTO__' ? rawSlug : name;
    record.slug = slugify(slugSource);
    if ((isCreate || hasSlug || hasName) && !String(record.slug ?? '').trim()) {
      throw new Error('Vocabulary.slug is required');
    }
  }

  const effectiveSource = source || String(record.source ?? '');
  if (effectiveSource === 'rva') {
    const sourceId = String(record.sourceId ?? '').trim();
    if (!sourceId) {
      throw new Error('Vocabulary.sourceId is required when source = rva');
    }
    record.sourceId = sourceId;
    record.rvaSourceKey = `${effectiveSource}:${sourceId}`;
  } else if (hasSource || isCreate) {
    delete record.rvaSourceKey;
  }
};

const beforeCreate = (record: Record<string, unknown>, cb: (err?: Error) => void): void => {
  normalizeAndResolveBranding(record, true)
    .then(() => cb())
    .catch((err: Error) => cb(err));
};

const beforeUpdate = (record: Record<string, unknown>, cb: (err?: Error) => void): void => {
  normalizeAndResolveBranding(record, false)
    .then(() => cb())
    .catch((err: Error) => cb(err));
};

const isLikelyMongoId = (value: string): boolean => /^[a-f\d]{24}$/i.test(value);

const normalizeAndResolveBranding = async (record: Record<string, unknown>, isCreate: boolean): Promise<void> => {
  normalize(record, isCreate);

  const hasBranding = typeof record.branding !== 'undefined';
  if (!hasBranding) {
    if (isCreate) {
      throw new Error('Vocabulary.branding is required');
    }
    return;
  }

  const brandingValue = String(record.branding ?? '').trim();
  if (!brandingValue) {
    throw new Error('Vocabulary.branding is required');
  }

  if (isLikelyMongoId(brandingValue)) {
    record.branding = brandingValue;
    return;
  }

  const branding = await BrandingConfig.findOne({ name: brandingValue });
  if (!branding?.id) {
    throw new Error(`Vocabulary.branding '${brandingValue}' not found`);
  }
  record.branding = String(branding.id);
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@Entity('vocabulary', {
  indexes: [
    { attributes: { branding: 1, slug: 1 }, unique: true },
    { attributes: { rvaSourceKey: 1 }, unique: true, sparse: true }
  ]
})
export class VocabularyClass {
  @Attr({ type: 'string', required: true })
  public name!: string;

  @Attr({ type: 'string' })
  public description?: string;

  @Attr({ type: 'string', defaultsTo: 'flat' })
  public type?: string;

  @Attr({ type: 'string', defaultsTo: 'local' })
  public source?: string;

  @Attr({ type: 'string' })
  public sourceId?: string;

  @Attr({ type: 'string' })
  public sourceVersionId?: string;

  @Attr({ type: 'string' })
  public lastSyncedAt?: string;

  @Attr({ type: 'string', defaultsTo: '__AUTO__' })
  public slug!: string;

  @Attr({ type: 'string' })
  public owner?: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'string' })
  public rvaSourceKey?: string | null;

  @HasMany('vocabularyentry', 'vocabulary')
  public entries?: unknown[];
}

export const VocabularyWLDef = toWaterlineModelDef(VocabularyClass);

export interface VocabularyAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  description?: string;
  entries?: (string | number | VocabularyEntryAttributes)[];
  lastSyncedAt?: string;
  name: string;
  owner?: string;
  rvaSourceKey?: string | null;
  slug: string;
  source?: 'local' | 'rva' | string;
  sourceId?: string;
  sourceVersionId?: string;
  type?: 'flat' | 'tree' | string;
}

export interface VocabularyWaterlineModel extends Sails.Model<VocabularyAttributes> {
  attributes: VocabularyAttributes;
}

declare global {
  const Vocabulary: VocabularyWaterlineModel;
}
