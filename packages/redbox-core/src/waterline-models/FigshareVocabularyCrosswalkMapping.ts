/// <reference path="../sails.ts" />
import {
  Attr,
  BeforeCreate,
  BeforeUpdate,
  BelongsTo,
  buildInvalidNewRecordError,
  Entity,
  toWaterlineModelDef
} from '../decorators';
import type { FigshareVocabularyCategoryAttributes } from './FigshareVocabularyCategory';
import type { FigshareVocabularyCrosswalkAttributes } from './FigshareVocabularyCrosswalk';
import type { VocabularyEntryAttributes } from './VocabularyEntry';

export const FIGSHARE_MAPPING_STATUSES = ['proposed', 'approved', 'rejected'] as const;
export type FigshareMappingStatus = (typeof FIGSHARE_MAPPING_STATUSES)[number];

export const FIGSHARE_MAPPING_MATCH_TYPES = [
  'exact-code',
  'identity',
  'label-suggestion',
  'manual',
  'historical'
] as const;
export type FigshareMappingMatchType = (typeof FIGSHARE_MAPPING_MATCH_TYPES)[number];

const VALID_STATUSES = new Set<string>(FIGSHARE_MAPPING_STATUSES);
const VALID_MATCH_TYPES = new Set<string>(FIGSHARE_MAPPING_MATCH_TYPES);

const normalize = (record: Record<string, unknown>, isCreate: boolean): void => {
  const hasRevision = typeof record.revision !== 'undefined';
  if (isCreate && !hasRevision) {
    throw buildInvalidNewRecordError('FigshareVocabularyCrosswalkMapping.revision is required');
  }
  if (hasRevision) {
    const revision = Number(record.revision);
    if (!Number.isInteger(revision) || revision <= 0) {
      throw new Error('FigshareVocabularyCrosswalkMapping.revision must be a positive integer');
    }
    record.revision = revision;
  }

  const hasStatus = typeof record.status !== 'undefined';
  const status = String((hasStatus ? record.status : (isCreate ? 'proposed' : undefined)) ?? '').toLowerCase();
  if (status) {
    if (!VALID_STATUSES.has(status)) {
      throw new Error(`FigshareVocabularyCrosswalkMapping.status must be one of: ${FIGSHARE_MAPPING_STATUSES.join(', ')}`);
    }
    record.status = status;
  }

  const hasMatchType = typeof record.matchType !== 'undefined';
  if (isCreate && !hasMatchType) {
    throw buildInvalidNewRecordError('FigshareVocabularyCrosswalkMapping.matchType is required');
  }
  if (hasMatchType) {
    const matchType = String(record.matchType ?? '').trim().toLowerCase();
    if (!VALID_MATCH_TYPES.has(matchType)) {
      throw new Error(`FigshareVocabularyCrosswalkMapping.matchType must be one of: ${FIGSHARE_MAPPING_MATCH_TYPES.join(', ')}`);
    }
    record.matchType = matchType;
  }

  if (record.status === 'approved' && !String(record.approvedBy ?? '').trim()) {
    throw new Error('FigshareVocabularyCrosswalkMapping.approvedBy is required when status = approved');
  }
};

const beforeCreate = (record: Record<string, unknown>, cb: (err?: Error) => void): void => {
  try {
    normalize(record, true);
    cb();
  } catch (err) {
    cb(err as Error);
  }
};

const beforeUpdate = (record: Record<string, unknown>, cb: (err?: Error) => void): void => {
  try {
    normalize(record, false);
    cb();
  } catch (err) {
    cb(err as Error);
  }
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@Entity('figsharevocabularycrosswalkmapping', {
  indexes: [
    { attributes: { crosswalk: 1, revision: 1, localEntry: 1, figshareCategory: 1 }, unique: true },
    { attributes: { crosswalk: 1, revision: 1, status: 1, localEntry: 1 } },
    { attributes: { figshareCategory: 1 } }
  ]
})
export class FigshareVocabularyCrosswalkMappingClass {
  @BelongsTo('figsharevocabularycrosswalk', { required: true })
  public crosswalk!: string | number;

  @Attr({ type: 'number', required: true })
  public revision!: number;

  @BelongsTo('vocabularyentry', { required: true })
  public localEntry!: string | number;

  @BelongsTo('figsharevocabularycategory', { required: true })
  public figshareCategory!: string | number;

  @Attr({ type: 'string', defaultsTo: 'proposed' })
  public status!: string;

  @Attr({ type: 'string', required: true })
  public matchType!: string;

  @Attr({ type: 'json' })
  public evidence?: Record<string, unknown>;

  @Attr({ type: 'string' })
  public approvedAt?: string;

  @Attr({ type: 'string' })
  public approvedBy?: string;
}

export const FigshareVocabularyCrosswalkMappingWLDef = toWaterlineModelDef(FigshareVocabularyCrosswalkMappingClass);

export interface FigshareVocabularyCrosswalkMappingAttributes extends Sails.WaterlineAttributes {
  approvedAt?: string;
  approvedBy?: string;
  crosswalk: string | number | FigshareVocabularyCrosswalkAttributes;
  evidence?: Record<string, unknown>;
  figshareCategory: string | number | FigshareVocabularyCategoryAttributes;
  localEntry: string | number | VocabularyEntryAttributes;
  matchType: FigshareMappingMatchType | string;
  revision: number;
  status: FigshareMappingStatus | string;
}

export interface FigshareVocabularyCrosswalkMappingWaterlineModel
  extends Sails.Model<FigshareVocabularyCrosswalkMappingAttributes> {
  attributes: FigshareVocabularyCrosswalkMappingAttributes;
}

declare global {
  const FigshareVocabularyCrosswalkMapping: FigshareVocabularyCrosswalkMappingWaterlineModel;
}
