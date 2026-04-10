/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, BelongsTo, Entity, HasMany, toWaterlineModelDef } from '../decorators';
import type { VocabularyAttributes } from './Vocabulary';

const normalize = (record: Record<string, unknown>, isCreate: boolean): void => {
  // prepare the errors
  const errCode = isCreate ? 'E_INVALID_NEW_RECORD' : 'E_INVALID_VALUES_TO_SET';
  const errLabel = new Error('VocabularyEntry.label is required');
  (errLabel as unknown as Record<string, unknown>).code = errCode;
  const errValue = new Error('VocabularyEntry.value is required');
  (errValue as unknown as Record<string, unknown>).code = errCode;

  // On create, the record.label must be present and be a non-empty string.
  // On update, the record.label may be present and must be a non-empty string if it is present.
  const label = String(record.label ?? '').trim();
  const hasLabelProp = Object.hasOwn(record, 'label');
  const hasLabelVal = !!record.label;
  console.warn(`VocabularyEntry normalize label ${label} hasLabelProp ${hasLabelProp} hasLabelVal ${hasLabelVal}`);
  if (isCreate && !hasLabelVal) {
    throw errLabel;
  } else if (!isCreate && hasLabelProp && !hasLabelVal) {
    throw errLabel;
  } else if ((isCreate && hasLabelVal) || (!isCreate && hasLabelProp && hasLabelVal)) {
    record.label = label;
    record.labelLower = label.toLowerCase();
  }

  // On create, the record.value must be persent and be a string, which can be a non-empty string.
  // On update, the record.value may be persent and must be a string, which can be a non-empty string, if it is present.
  const value = String(record.value ?? '').trim();
  const hasValueProp = Object.hasOwn(record, 'value');
  const hasValueVal = record.value !== undefined && record.value !== null;
  console.warn(`VocabularyEntry normalize value ${value} hasValueProp ${hasValueProp} hasValueVal ${hasValueVal}`);
  if (isCreate && !hasValueVal) {
    throw errValue;
  } else if (!isCreate && hasValueProp && !hasValueVal) {
    throw errValue;
  } else if ((isCreate && hasValueVal) || (!isCreate && hasValueProp && hasValueVal)) {
    record.value = value;
    record.valueLower = value.toLowerCase();
  }

  // On either create or update, the record.historical may be present, normalise it to a bool if it is present.
  if (Object.hasOwn(record, 'historical')) {
    record.historical = toBoolean(record.historical);
  }

  // const hasLabel = typeof record.label !== 'undefined';
  // const hasValue = typeof record.value !== 'undefined';
  // const hasHistorical = typeof record.historical !== 'undefined';
  //
  // const label = hasLabel ? String(record.label ?? '').trim() : '';
  // const value = hasValue ? String(record.value ?? '').trim() : '';
  //
  // if ((isCreate || hasLabel) && !label) {
  //   throw new Error('VocabularyEntry.label is required');
  // }
  // if (isCreate || hasValue) {
  //   throw new Error('VocabularyEntry.value is required');
  // }
  //
  // if (hasLabel || isCreate) {
  //   record.label = label;
  //   record.labelLower = label.toLowerCase();
  // }
  // if (hasValue || isCreate) {
  //   record.value = value;
  //   record.valueLower = value.toLowerCase();
  // }
  // if (hasHistorical || isCreate) {
  //   record.historical = toBoolean(record.historical);
  // }
};

const toBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
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

  let recordVocabulary = record.vocabulary ? String(record.vocabulary) : '';
  if (!recordVocabulary && record.id) {
    const existing = await VocabularyEntry.findOne({ id: String(record.id) });
    if (!existing) {
      throw new Error('VocabularyEntry not found for parent validation');
    }
    if (existing.vocabulary) {
      recordVocabulary = String(existing.vocabulary);
    }
  }

  if (recordVocabulary && String(parent.vocabulary) !== recordVocabulary) {
    throw new Error('VocabularyEntry.parent must belong to the same vocabulary');
  }

  const recordId = record.id ? String(record.id) : '';
  const visited = new Set<string>();
  let cursor: VocabularyEntryAttributes | null = parent as VocabularyEntryAttributes;
  while (cursor?.id) {
    const currentId = String(cursor.id);
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);
    if (recordId && currentId === recordId) {
      throw new Error('VocabularyEntry cycle detected');
    }
    if (!cursor.parent) {
      break;
    }
    cursor = await VocabularyEntry.findOne({ id: String(cursor.parent) }) as VocabularyEntryAttributes | null;
  }
};

const validateIdentifierUnique = async (record: Record<string, unknown>): Promise<void> => {
  const identifier = String(record.identifier ?? '').trim();

  let recordVocabulary = record.vocabulary ? String(record.vocabulary) : '';
  if (!recordVocabulary && record.id) {
    const existing = await VocabularyEntry.findOne({ id: String(record.id) });
    if (!existing) {
      throw new Error('VocabularyEntry not found for parent validation');
    }
    if (existing.vocabulary) {
      recordVocabulary = String(existing.vocabulary);
    }
  }

  if (!identifier || !recordVocabulary) {
    return;
  }
  const recordId = record.id ? String(record.id) : '';
  const duplicate = await VocabularyEntry.findOne({ vocabulary: recordVocabulary, identifier }) as VocabularyEntryAttributes | null;
  if (duplicate && (!recordId || String(duplicate.id) !== recordId)) {
    throw new Error('VocabularyEntry.identifier must be unique within a vocabulary');
  }
};

const beforeCreate = (record: Record<string, unknown>, cb: (err?: Error) => void): void => {
  try {
    normalize(record, true);
  } catch (err) {
    cb(err as Error);
    return;
  }
  validateIdentifierUnique(record)
    .then(() => validateParent(record))
    .then(() => cb())
    .catch((err: Error) => cb(err));
};

const beforeUpdate = (record: Record<string, unknown>, cb: (err?: Error) => void): void => {
  try {
    normalize(record, false);
  } catch (err) {
    cb(err as Error);
    return;
  }
  validateIdentifierUnique(record)
    .then(() => validateParent(record))
    .then(() => cb())
    .catch((err: Error) => cb(err));
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@Entity('vocabularyentry', {
  indexes: [
    { attributes: { vocabulary: 1, labelLower: 1 }, unique: true },
    { attributes: { vocabulary: 1, valueLower: 1 }, unique: true },
    { attributes: { vocabulary: 1, identifier: 1 }, unique: true }
  ]
})
export class VocabularyEntryClass {
  @BelongsTo('vocabulary', { required: true })
  public vocabulary!: string | number;

  @Attr({ type: 'string', required: true })
  public label!: string;

  @Attr({ type: 'string', required: true })
  public labelLower!: string;

  @Attr({ type: 'string', required: false })
  public value!: string;

  @Attr({ type: 'string', required: false })
  public valueLower!: string;

  @BelongsTo('vocabularyentry')
  public parent?: string | number;

  @HasMany('vocabularyentry', 'parent')
  public children?: unknown[];

  @Attr({ type: 'string' })
  public identifier?: string;

  @Attr({ type: 'number', defaultsTo: 0 })
  public order?: number;

  @Attr({ type: 'boolean', defaultsTo: false })
  public historical?: boolean;
}

export const VocabularyEntryWLDef = toWaterlineModelDef(VocabularyEntryClass);

export interface VocabularyEntryAttributes extends Sails.WaterlineAttributes {
  children?: (string | number | VocabularyEntryAttributes)[];
  identifier?: string;
  label: string;
  labelLower: string;
  order?: number;
  historical?: boolean;
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
