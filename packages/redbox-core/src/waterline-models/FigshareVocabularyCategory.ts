/// <reference path="../sails.ts" />
import {
  Attr,
  BeforeCreate,
  BeforeUpdate,
  BelongsTo,
  buildInvalidNewRecordError,
  buildInvalidUpdateRecordError,
  Entity,
  toWaterlineModelDef
} from '../decorators';
import type { FigshareVocabularySourceAttributes } from './FigshareVocabularySource';
import type { VocabularyEntryAttributes } from './VocabularyEntry';
import { toBoolean } from '@researchdatabox/sails-ng-common';

const requireTrimmed = (record: Record<string, unknown>, field: string, isCreate: boolean): void => {
  const hasField = typeof record[field] !== 'undefined';
  if (!hasField) {
    if (isCreate) {
      throw buildInvalidNewRecordError(`FigshareVocabularyCategory.${field} is required`);
    }
    return;
  }
  const value = String(record[field] ?? '').trim();
  if (!value) {
    throw isCreate
      ? buildInvalidNewRecordError(`FigshareVocabularyCategory.${field} is required`)
      : buildInvalidUpdateRecordError(`FigshareVocabularyCategory.${field} is required`);
  }
  record[field] = value;
};

const normalize = (record: Record<string, unknown>, isCreate: boolean): void => {
  requireTrimmed(record, 'sourceId', isCreate);
  requireTrimmed(record, 'taxonomyId', isCreate);
  requireTrimmed(record, 'contentHash', isCreate);
  requireTrimmed(record, 'firstSeenAt', isCreate);
  requireTrimmed(record, 'lastSeenAt', isCreate);

  if (typeof record.parentSourceId !== 'undefined' && record.parentSourceId !== null) {
    record.parentSourceId = String(record.parentSourceId).trim();
  }

  const hasCategoryId = typeof record.categoryId !== 'undefined';
  if (!hasCategoryId) {
    if (isCreate) {
      throw buildInvalidNewRecordError('FigshareVocabularyCategory.categoryId is required');
    }
  } else {
    const categoryId = Number(record.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      throw new Error('FigshareVocabularyCategory.categoryId must be a positive integer');
    }
    record.categoryId = categoryId;
  }

  if (typeof record.path !== 'undefined' && !Array.isArray(record.path)) {
    throw new Error('FigshareVocabularyCategory.path must be an array of sourceIds');
  }

  for (const flag of ['selectable', 'historical']) {
    if (Object.hasOwn(record, flag)) {
      record[flag] = toBoolean(record[flag]);
    }
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
@Entity('figsharevocabularycategory', {
  indexes: [
    { attributes: { source: 1, sourceId: 1 }, unique: true },
    { attributes: { source: 1, categoryId: 1 }, unique: true },
    { attributes: { entry: 1 }, unique: true },
    { attributes: { source: 1, historical: 1, selectable: 1 } }
  ]
})
export class FigshareVocabularyCategoryClass {
  @BelongsTo('figsharevocabularysource', { required: true })
  public source!: string | number;

  @BelongsTo('vocabularyentry', { required: true })
  public entry!: string | number;

  @Attr({ type: 'string', required: true })
  public sourceId!: string;

  @Attr({ type: 'number', required: true })
  public categoryId!: number;

  @Attr({ type: 'string', required: true })
  public taxonomyId!: string;

  @Attr({ type: 'string' })
  public parentSourceId?: string;

  @Attr({ type: 'json' })
  public path?: string[];

  @Attr({ type: 'boolean', defaultsTo: true })
  public selectable?: boolean;

  @Attr({ type: 'boolean', defaultsTo: false })
  public historical?: boolean;

  @Attr({ type: 'string', required: true })
  public firstSeenAt!: string;

  @Attr({ type: 'string', required: true })
  public lastSeenAt!: string;

  @Attr({ type: 'string', required: true })
  public contentHash!: string;
}

export const FigshareVocabularyCategoryWLDef = toWaterlineModelDef(FigshareVocabularyCategoryClass);

export interface FigshareVocabularyCategoryAttributes extends Sails.WaterlineAttributes {
  categoryId: number;
  contentHash: string;
  entry: string | number | VocabularyEntryAttributes;
  firstSeenAt: string;
  historical?: boolean;
  lastSeenAt: string;
  parentSourceId?: string;
  path?: string[];
  selectable?: boolean;
  source: string | number | FigshareVocabularySourceAttributes;
  sourceId: string;
  taxonomyId: string;
}

export interface FigshareVocabularyCategoryWaterlineModel extends Sails.Model<FigshareVocabularyCategoryAttributes> {
  attributes: FigshareVocabularyCategoryAttributes;
}

declare global {
  const FigshareVocabularyCategory: FigshareVocabularyCategoryWaterlineModel;
}
