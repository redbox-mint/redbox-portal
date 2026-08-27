import {
  FigshareCategory,
  FigshareGroupMetadataField,
  FigshareInstitutionCustomField,
  FigshareLicense,
} from '../figshare/types';

export type FieldSource = 'core' | 'institution-custom' | 'group-custom';

export interface DiscoveredField {
  id: string | number;
  name?: string;
  displayName?: string;
  fieldType?: string;
  required?: boolean;
  hint?: string;
  description?: string;
  settings?: unknown;
  order?: number;
  source: FieldSource;
  rawDefinition?: Record<string, unknown>;
  rawConfiguration: Record<string, unknown>;
}

export interface RawMetadataDiscovery {
  coreFields: Record<string, unknown>[];
  institutionCustomFields: FigshareInstitutionCustomField[];
  groupItemMetadata: FigshareGroupMetadataField[];
  licenses: FigshareLicense[];
  categories: FigshareCategory[];
}

export type DiscoveryEvent =
  | { kind: 'core-fields'; count: number }
  | { kind: 'institution-fields'; count: number }
  | { kind: 'group-fields'; groupId: number; count: number }
  | { kind: 'licenses'; count: number }
  | { kind: 'categories'; count: number };

export interface MetadataDiscoveryResult {
  target: {
    itemType: 'dataset';
    groupId: number;
  };
  fields: DiscoveredField[];
  licenses: FigshareLicense[];
  categories: FigshareCategory[];
  raw: RawMetadataDiscovery;
}
