import { brandingFields } from './fields';
import { normalizePersistenceFields } from '../fieldNormalization';
import type { BrandingValues } from './BrandingRepository';

export const normalizeBrandingFields = (collection: string, values: BrandingValues, patch: boolean): BrandingValues =>
  normalizePersistenceFields(brandingFields[collection], values, patch);
