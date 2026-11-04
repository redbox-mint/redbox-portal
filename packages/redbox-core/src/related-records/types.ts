import type { BrandingModel } from '../model/storage/BrandingModel';
import type { UserModel } from '../model/storage/UserModel';

export interface RelatedRelationResolutionConfig {
  /** RFC 6901 pointers relative to source metadata; no implicit full projection. */
  metadataFields: string[];
}

/** Server-owned read authority. Audience never grants additional source access. */
export type RelatedRecordReadContext = {
  readonly brand: BrandingModel;
  readonly user: UserModel;
} & (
  | { readonly audience: 'browser' | 'api'; readonly serviceId?: never }
  | { readonly audience: 'service'; readonly serviceId: string }
);
