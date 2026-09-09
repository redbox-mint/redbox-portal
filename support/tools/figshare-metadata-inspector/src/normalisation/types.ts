import { FieldSource } from '../discovery/types';

export interface ControlledValue {
  id?: string | number;
  value: string;
  label?: string;
}

export type ControlledValueResult =
  | { kind: 'none' }
  | { kind: 'inline'; values: ControlledValue[] }
  | { kind: 'api-reference'; entity: 'license' | 'category' | string; values: ControlledValue[] }
  | { kind: 'dynamic'; description: string }
  | { kind: 'unknown'; raw: unknown };

export interface NormalisedField {
  id: string | number;
  name: string;
  displayName?: string;
  type: string;
  required: boolean;
  description?: string;
  hint?: string;
  source: FieldSource;
  settings?: unknown;
  order?: number;
  values?: ControlledValue[];
  valueSource: 'inline' | 'license' | 'category' | 'dynamic' | 'none' | 'unknown';
  valueSourceDescription?: string;
  rawDefinition?: unknown;
  rawConfiguration: unknown;
}

export interface NormalisedCategory {
  id: string | number;
  title: string;
  parentId?: string | number;
  path: string;
  raw: unknown;
}

export interface FigshareMetadataModel {
  generatedAt: string;
  source: {
    baseUrl: string;
    apiVersions: ['v2'];
    discoveryMode: 'cqu-v2-dataset';
    groupId: number;
  };
  referencedEntities: {
    licenses: Array<{ id: string | number; name: string; url?: string; raw: unknown }>;
    categories: NormalisedCategory[];
  };
  itemTypes: Array<{
    id: string | number;
    name: string;
    groupId: number;
    raw: unknown;
    fields: NormalisedField[];
  }>;
}
