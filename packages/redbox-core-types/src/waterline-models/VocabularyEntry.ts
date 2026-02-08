/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, BelongsTo, Entity, HasMany, toWaterlineModelDef } from '../decorators';
import type { VocabularyAttributes } from './Vocabulary';

const normalize = (record: Record<string, unknown>, isCreate: boolean): void => {
  const hasLabel = typeof record.label !== 'undefined';
  const hasValue = typeof record.value !== 'undefined';

  const label = hasLabel ? String(record.label ?? '').trim() : '';
  const value = hasValue ? String(record.value ?? '').trim() : '';

  if ((isCreate || hasLabel) && !label) {
    throw new Error('VocabularyEntry.label is required');
  }
  if ((isCreate || hasValue) && !value) {
    throw new Error('VocabularyEntry.value is required');
  }

  if (hasLabel || isCreate) {
    record.label = label;
    record.labelLower = label.toLowerCase();
  }
  if (hasValue || isCreate) {
    record.value = value;
    record.valueLower = value.toLowerCase();
  }
};

const validateParent = async (record: Record<string, unknown>): Promise<void> => {
  if (!record.parent) {
    return;
  }

  if (record.id && String(record.parent) === String(record.id)) {
    throw new Error('VocabularyEntry cannot parent itself');
  }

  const parent = await VocabularyEntry.findOne({ id: String(record.parent) });
  if (!parent) {
    throw new Error('VocabularyEntry.parent not found');
  }

  if (record.vocabulary && String(parent.vocabulary) !== String(record.vocabulary)) {
    throw new Error('VocabularyEntry.parent must belong to the same vocabulary');
  }
};

const beforeCreate = (record: Record<string, unknown>, cb: (err?: Error) => void): void => {
  normalize(record, true);
  validateParent(record)
    .then(() => cb())
    .catch((err: Error) => cb(err));
};

const beforeUpdate = (record: Record<string, unknown>, cb: (err?: Error) => void): void => {
  normalize(record, false);
  validateParent(record)
    .then(() => cb())
    .catch((err: Error) => cb(err));
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@Entity('vocabularyentry', {
  indexes: [
    { attributes: { vocabulary: 1, labelLower: 1 }, unique: true },
    { attributes: { vocabulary: 1, valueLower: 1 }, unique: true },
    { attributes: { vocabulary: 1, identifier: 1 }, unique: false }
  ]
})
export class VocabularyEntryClass {
  @BelongsTo('vocabulary', { required: true })
  public vocabulary!: string | number;

  @Attr({ type: 'string', required: true })
  public label!: string;

  @Attr({ type: 'string', defaultsTo: '__AUTO__' })
  public labelLower!: string;

  @Attr({ type: 'string', required: true })
  public value!: string;

  @Attr({ type: 'string', defaultsTo: '__AUTO__' })
  public valueLower!: string;

  @BelongsTo('vocabularyentry')
  public parent?: string | number;

  @HasMany('vocabularyentry', 'parent')
  public children?: unknown[];

  @Attr({ type: 'string' })
  public identifier?: string;

  @Attr({ type: 'number', defaultsTo: 0 })
  public order?: number;
}

export const VocabularyEntryWLDef = toWaterlineModelDef(VocabularyEntryClass);

export interface VocabularyEntryAttributes extends Sails.WaterlineAttributes {
  children?: (string | number | VocabularyEntryAttributes)[];
  identifier?: string;
  label: string;
  labelLower: string;
  order?: number;
  parent?: string | number | VocabularyEntryAttributes;
  value: string;
  valueLower: string;
  vocabulary: string | number | VocabularyAttributes;
}

export interface VocabularyEntryWaterlineModel extends Sails.Model<VocabularyEntryAttributes> {
  attributes: VocabularyEntryAttributes;
}

declare global {
  const VocabularyEntry: VocabularyEntryWaterlineModel;
}
