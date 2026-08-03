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
import type { BrandingConfigAttributes } from './BrandingConfig';
import type { FigshareVocabularyCrosswalkAttributes } from './FigshareVocabularyCrosswalk';
import type { FigshareVocabularySourceAttributes, FigshareVocabularyScope } from './FigshareVocabularySource';
import type { VocabularyAttributes } from './Vocabulary';

export const FIGSHARE_SYNC_RUN_STATES = [
  'fetching',
  'previewed',
  'applying',
  'applied',
  'failed',
  'expired'
] as const;
export type FigshareSyncRunState = (typeof FIGSHARE_SYNC_RUN_STATES)[number];

const VALID_STATES = new Set<string>(FIGSHARE_SYNC_RUN_STATES);
const VALID_SCOPES = new Set(['public', 'account']);

/**
 * Terminal states never transition again; `applying` is the concurrency latch that
 * prevents a second apply from writing while the first is in flight.
 */
const ALLOWED_STATE_TRANSITIONS: Record<string, readonly string[]> = {
  fetching: ['previewed', 'failed', 'expired'],
  previewed: ['applying', 'failed', 'expired'],
  applying: ['applied', 'failed'],
  applied: [],
  failed: [],
  expired: []
};

export function isAllowedSyncRunTransition(from: string, to: string): boolean {
  if (from === to) {
    return true;
  }
  return (ALLOWED_STATE_TRANSITIONS[from] ?? []).includes(to);
}

const normalize = (record: Record<string, unknown>, isCreate: boolean): void => {
  const hasState = typeof record.state !== 'undefined';
  const state = String((hasState ? record.state : (isCreate ? 'fetching' : undefined)) ?? '').toLowerCase();
  if (state) {
    if (!VALID_STATES.has(state)) {
      throw new Error(`FigshareVocabularySyncRun.state must be one of: ${FIGSHARE_SYNC_RUN_STATES.join(', ')}`);
    }
    record.state = state;
  }

  const hasScope = typeof record.scope !== 'undefined';
  if (isCreate && !hasScope) {
    throw buildInvalidNewRecordError('FigshareVocabularySyncRun.scope is required');
  }
  if (hasScope) {
    const scope = String(record.scope ?? '').trim().toLowerCase();
    if (!VALID_SCOPES.has(scope)) {
      throw new Error('FigshareVocabularySyncRun.scope must be one of: public, account');
    }
    record.scope = scope;
  }

  for (const field of ['taxonomyId', 'normalizerVersion', 'expiresAt', 'requestedBy']) {
    const hasField = typeof record[field] !== 'undefined';
    if (isCreate && !hasField) {
      throw buildInvalidNewRecordError(`FigshareVocabularySyncRun.${field} is required`);
    }
    if (hasField) {
      const value = String(record[field] ?? '').trim();
      if (!value) {
        throw new Error(`FigshareVocabularySyncRun.${field} is required`);
      }
      record[field] = value;
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
@Entity('figsharevocabularysyncrun', {
  indexes: [
    { attributes: { source: 1, createdAt: -1 } },
    { attributes: { state: 1, expiresAt: 1 } },
    { attributes: { branding: 1, createdAt: -1 } }
  ]
})
export class FigshareVocabularySyncRunClass {
  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  /** Absent for the first import of a catalogue: apply creates the source. */
  @Attr({ type: 'string', allowNull: true })
  public source?: string | null;

  @Attr({ type: 'string', required: true })
  public scope!: string;

  @Attr({ type: 'string', required: true })
  public taxonomyId!: string;

  @Attr({ type: 'string', allowNull: true })
  public localVocabulary?: string | null;

  @Attr({ type: 'string', allowNull: true })
  public crosswalk?: string | null;

  @Attr({ type: 'boolean', defaultsTo: false })
  public createLocalClone?: boolean;

  @Attr({ type: 'string' })
  public localCloneName?: string;

  @Attr({ type: 'string' })
  public localCloneSlug?: string;

  @Attr({ type: 'string', required: true })
  public normalizerVersion!: string;

  @Attr({ type: 'string', defaultsTo: 'fetching' })
  public state!: string;

  @Attr({ type: 'string' })
  public baseHash?: string;

  @Attr({ type: 'string' })
  public remoteHash?: string;

  @Attr({ type: 'json' })
  public normalizedSnapshot?: unknown[];

  @Attr({ type: 'json' })
  public diff?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public proposals?: unknown[];

  @Attr({ type: 'json' })
  public summary?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public warnings?: unknown[];

  @Attr({ type: 'json' })
  public result?: Record<string, unknown>;

  @Attr({ type: 'string', required: true })
  public expiresAt!: string;

  @Attr({ type: 'string', required: true })
  public requestedBy!: string;

  @Attr({ type: 'string' })
  public appliedBy?: string;

  @Attr({ type: 'string' })
  public appliedAt?: string;

  @Attr({ type: 'string' })
  public errorCode?: string;

  @Attr({ type: 'string' })
  public errorDetail?: string;
}

export const FigshareVocabularySyncRunWLDef = toWaterlineModelDef(FigshareVocabularySyncRunClass);

export interface FigshareVocabularySyncRunAttributes extends Sails.WaterlineAttributes {
  appliedAt?: string;
  appliedBy?: string;
  baseHash?: string;
  branding: string | number | BrandingConfigAttributes;
  createLocalClone?: boolean;
  crosswalk?: string | null | FigshareVocabularyCrosswalkAttributes;
  diff?: Record<string, unknown>;
  errorCode?: string;
  errorDetail?: string;
  expiresAt: string;
  localCloneName?: string;
  localCloneSlug?: string;
  localVocabulary?: string | null | VocabularyAttributes;
  normalizedSnapshot?: unknown[];
  normalizerVersion: string;
  proposals?: unknown[];
  remoteHash?: string;
  requestedBy: string;
  result?: Record<string, unknown>;
  scope: FigshareVocabularyScope | string;
  source?: string | null | FigshareVocabularySourceAttributes;
  state: FigshareSyncRunState | string;
  summary?: Record<string, unknown>;
  taxonomyId: string;
  warnings?: unknown[];
}

export interface FigshareVocabularySyncRunWaterlineModel extends Sails.Model<FigshareVocabularySyncRunAttributes> {
  attributes: FigshareVocabularySyncRunAttributes;
}

declare global {
  const FigshareVocabularySyncRun: FigshareVocabularySyncRunWaterlineModel;
}
