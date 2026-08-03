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
import type { VocabularyAttributes } from './Vocabulary';

/** Figshare exposes a public catalogue and an authenticated account catalogue. */
export const FIGSHARE_VOCABULARY_SCOPES = ['public', 'account'] as const;
export type FigshareVocabularyScope = (typeof FIGSHARE_VOCABULARY_SCOPES)[number];

const VALID_SCOPES = new Set<string>(FIGSHARE_VOCABULARY_SCOPES);

const requireTrimmed = (
  record: Record<string, unknown>,
  field: string,
  isCreate: boolean
): void => {
  const hasField = typeof record[field] !== 'undefined';
  if (!hasField) {
    if (isCreate) {
      throw buildInvalidNewRecordError(`FigshareVocabularySource.${field} is required`);
    }
    return;
  }
  const value = String(record[field] ?? '').trim();
  if (!value) {
    throw isCreate
      ? buildInvalidNewRecordError(`FigshareVocabularySource.${field} is required`)
      : buildInvalidUpdateRecordError(`FigshareVocabularySource.${field} is required`);
  }
  record[field] = value;
};

const normalize = (record: Record<string, unknown>, isCreate: boolean): void => {
  requireTrimmed(record, 'taxonomyId', isCreate);
  requireTrimmed(record, 'displayName', isCreate);
  requireTrimmed(record, 'createdBy', isCreate);
  requireTrimmed(record, 'updatedBy', isCreate);

  const hasScope = typeof record.scope !== 'undefined';
  if (!hasScope) {
    if (isCreate) {
      throw buildInvalidNewRecordError('FigshareVocabularySource.scope is required');
    }
    return;
  }
  const scope = String(record.scope ?? '').trim().toLowerCase();
  if (!VALID_SCOPES.has(scope)) {
    throw new Error(`FigshareVocabularySource.scope must be one of: ${FIGSHARE_VOCABULARY_SCOPES.join(', ')}`);
  }
  record.scope = scope;
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
@Entity('figsharevocabularysource', {
  indexes: [
    { attributes: { branding: 1, scope: 1, taxonomyId: 1 }, unique: true },
    { attributes: { vocabulary: 1 }, unique: true },
    { attributes: { branding: 1, lastSyncedAt: 1 } }
  ]
})
export class FigshareVocabularySourceClass {
  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @BelongsTo('vocabulary', { required: true })
  public vocabulary!: string | number;

  @Attr({ type: 'string', required: true })
  public scope!: string;

  @Attr({ type: 'string', required: true })
  public taxonomyId!: string;

  /**
   * Reference to trusted deployment configuration used to resolve the Figshare
   * connection server-side. Never holds a token.
   */
  @Attr({ type: 'string' })
  public connectionKey?: string;

  @Attr({ type: 'string', required: true })
  public displayName!: string;

  @Attr({ type: 'string' })
  public remoteHash?: string;

  @Attr({ type: 'string' })
  public lastSyncedAt?: string;

  @Attr({ type: 'string' })
  public lastSyncRun?: string;

  @Attr({ type: 'boolean', defaultsTo: false })
  public archived?: boolean;

  @Attr({ type: 'string', required: true })
  public createdBy!: string;

  @Attr({ type: 'string', required: true })
  public updatedBy!: string;
}

export const FigshareVocabularySourceWLDef = toWaterlineModelDef(FigshareVocabularySourceClass);

export interface FigshareVocabularySourceAttributes extends Sails.WaterlineAttributes {
  archived?: boolean;
  branding: string | number | BrandingConfigAttributes;
  connectionKey?: string;
  createdBy: string;
  displayName: string;
  lastSyncRun?: string;
  lastSyncedAt?: string;
  remoteHash?: string;
  scope: FigshareVocabularyScope | string;
  taxonomyId: string;
  updatedBy: string;
  vocabulary: string | number | VocabularyAttributes;
}

export interface FigshareVocabularySourceWaterlineModel extends Sails.Model<FigshareVocabularySourceAttributes> {
  attributes: FigshareVocabularySourceAttributes;
}

declare global {
  const FigshareVocabularySource: FigshareVocabularySourceWaterlineModel;
}
