import type { RecordSchemaArtifactModel } from './storage/record-schema';
import type { RecordSchemaProblemCode } from '../record-contract/codes';
import type { ContractJsonObject } from '../record-contract/types';

export type RecordSchemaProblemStatus = 400 | 401 | 403 | 404 | 409 | 412 | 413 | 422 | 503;

/** Safe resolver Problem Details. This is deliberately separate from save-validation issues. */
export interface RecordSchemaProblem extends ContractJsonObject {
  readonly type: string;
  readonly title: string;
  readonly status: RecordSchemaProblemStatus;
  readonly detail: string;
  readonly instance: string;
  readonly code: RecordSchemaProblemCode;
}

export type ResolveRecordSchemaResult =
  | {
      readonly kind: 'resolved';
      readonly artifact: RecordSchemaArtifactModel;
    }
  | { readonly kind: 'not-modified'; readonly artifact: RecordSchemaArtifactModel }
  | { readonly kind: 'invalid-request'; readonly problem: RecordSchemaProblem }
  | { readonly kind: 'not-found'; readonly problem: RecordSchemaProblem }
  | { readonly kind: 'forbidden'; readonly problem: RecordSchemaProblem }
  | { readonly kind: 'not-resolvable'; readonly problem: RecordSchemaProblem }
  | { readonly kind: 'limit-exceeded'; readonly problem: RecordSchemaProblem }
  | { readonly kind: 'invalid-contract'; readonly problem: RecordSchemaProblem }
  | { readonly kind: 'unavailable'; readonly problem: RecordSchemaProblem };
