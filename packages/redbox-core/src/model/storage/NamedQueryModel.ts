import { BrandingModel } from './BrandingModel';

export class NamedQueryModel {
  key: string = '';
  name: string = '';
  branding: BrandingModel = new BrandingModel();
  source?: 'database' | 'graphql' | null;
  description?: string | null;
  graphql?: string | null;
  expandRelations?: boolean;
  relatedRecordFilters?: string | null;
  mongoQuery: string | null = '';
  queryParams: string | null = '';
  collectionName?: string | null;
  resultObjectMapping?: string | null;
  brandIdFieldPath?: string | null;
  sort?: string | null;
}
