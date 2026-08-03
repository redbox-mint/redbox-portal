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
import type { BrandingConfigAttributes } from './BrandingConfig';
import type { FigshareVocabularySourceAttributes } from './FigshareVocabularySource';
import type { VocabularyAttributes } from './Vocabulary';

export const FIGSHARE_CROSSWALK_STATUSES = ['draft', 'approved', 'archived'] as const;
export type FigshareCrosswalkStatus = (typeof FIGSHARE_CROSSWALK_STATUSES)[number];

const VALID_STATUSES = new Set<string>(FIGSHARE_CROSSWALK_STATUSES);

const normalize = (record: Record<string, unknown>, isCreate: boolean): void => {
  const hasName = typeof record.name !== 'undefined';
  if (isCreate && !hasName) {
    throw buildInvalidNewRecordError('FigshareVocabularyCrosswalk.name is required');
  }
  if (hasName) {
    const name = String(record.name ?? '').trim();
    if (!name) {
      throw isCreate
        ? buildInvalidNewRecordError('FigshareVocabularyCrosswalk.name is required')
        : buildInvalidUpdateRecordError('FigshareVocabularyCrosswalk.name is required');
    }
    record.name = name;
  }

  const hasUpdatedBy = typeof record.updatedBy !== 'undefined';
  if (isCreate && !hasUpdatedBy) {
    throw buildInvalidNewRecordError('FigshareVocabularyCrosswalk.updatedBy is required');
  }
  if (hasUpdatedBy) {
    const updatedBy = String(record.updatedBy ?? '').trim();
    if (!updatedBy) {
      throw isCreate
        ? buildInvalidNewRecordError('FigshareVocabularyCrosswalk.updatedBy is required')
        : buildInvalidUpdateRecordError('FigshareVocabularyCrosswalk.updatedBy is required');
    }
    record.updatedBy = updatedBy;
  }

  const hasStatus = typeof record.status !== 'undefined';
  const status = String((hasStatus ? record.status : (isCreate ? 'draft' : undefined)) ?? '').toLowerCase();
  if (status) {
    if (!VALID_STATUSES.has(status)) {
      throw new Error(`FigshareVocabularyCrosswalk.status must be one of: ${FIGSHARE_CROSSWALK_STATUSES.join(', ')}`);
    }
    record.status = status;
  }

  for (const field of ['workingRevision', 'approvedRevision']) {
    if (typeof record[field] === 'undefined' || record[field] === null) {
      continue;
    }
    const revision = Number(record[field]);
    if (!Number.isInteger(revision) || revision <= 0) {
      throw new Error(`FigshareVocabularyCrosswalk.${field} must be a positive integer`);
    }
    record[field] = revision;
  }

  const workingRevision = Number(record.workingRevision ?? 0);
  const approvedRevision = Number(record.approvedRevision ?? 0);
  if (workingRevision > 0 && approvedRevision > 0 && approvedRevision > workingRevision) {
    throw new Error('FigshareVocabularyCrosswalk.approvedRevision must be less than or equal to workingRevision');
  }

  if (record.status === 'approved' && !String(record.approvedBy ?? '').trim()) {
    throw new Error('FigshareVocabularyCrosswalk.approvedBy is required when status = approved');
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
@Entity('figsharevocabularycrosswalk', {
  indexes: [
    { attributes: { branding: 1, name: 1 }, unique: true },
    { attributes: { localVocabulary: 1, figshareSource: 1, status: 1 } }
  ]
})
export class FigshareVocabularyCrosswalkClass {
  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('vocabulary', { required: true })
  public localVocabulary!: string | number;

  @BelongsTo('figsharevocabularysource', { required: true })
  public figshareSource!: string | number;

  @Attr({ type: 'string', defaultsTo: 'draft' })
  public status!: string;

  @Attr({ type: 'number', defaultsTo: 1 })
  public workingRevision!: number;

  @Attr({ type: 'number', allowNull: true })
  public approvedRevision?: number | null;

  @Attr({ type: 'string' })
  public approvedAt?: string;

  @Attr({ type: 'string' })
  public approvedBy?: string;

  @Attr({ type: 'string', required: true })
  public updatedBy!: string;
}

export const FigshareVocabularyCrosswalkWLDef = toWaterlineModelDef(FigshareVocabularyCrosswalkClass);

export interface FigshareVocabularyCrosswalkAttributes extends Sails.WaterlineAttributes {
  approvedAt?: string;
  approvedBy?: string;
  approvedRevision?: number | null;
  branding: string | number | BrandingConfigAttributes;
  figshareSource: string | number | FigshareVocabularySourceAttributes;
  localVocabulary: string | number | VocabularyAttributes;
  name: string;
  status: FigshareCrosswalkStatus | string;
  updatedBy: string;
  workingRevision: number;
}

export interface FigshareVocabularyCrosswalkWaterlineModel extends Sails.Model<FigshareVocabularyCrosswalkAttributes> {
  attributes: FigshareVocabularyCrosswalkAttributes;
}

declare global {
  const FigshareVocabularyCrosswalk: FigshareVocabularyCrosswalkWaterlineModel;
}
