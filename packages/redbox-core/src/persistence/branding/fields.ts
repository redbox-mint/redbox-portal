export interface BrandingField {
  type: 'string' | 'number' | 'json' | 'id';
  required?: boolean;
  nullable?: boolean;
  default?: unknown;
}
export const brandingFields: Record<string, Record<string, BrandingField>> = {
  brandingconfig: {
    name: { type: 'string' },
    css: { type: 'string' },
    variables: { type: 'json' },
    version: { type: 'number', default: 0 },
    hash: { type: 'string', default: '' },
    logo: { type: 'json' },
    favicon: { type: 'json' },
    typeface: { type: 'json' },
    draftTypeface: { type: 'json' },
    draftRevision: { type: 'number', default: 0 },
  },
  brandingconfighistory: {
    branding: { type: 'id', required: true },
    version: { type: 'number', required: true },
    hash: { type: 'string', required: true },
    css: { type: 'string' },
    variables: { type: 'json' },
    typeface: { type: 'json' },
    actorId: { type: 'string' },
    actorDisplayName: { type: 'string' },
    restoredFromVersion: { type: 'number' },
    dateCreated: { type: 'string' },
  },
};
