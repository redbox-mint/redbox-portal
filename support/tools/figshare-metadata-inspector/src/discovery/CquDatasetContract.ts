import { DiscoveredField } from './types';

export const CQU_DATASET_ITEM_TYPE = 'dataset' as const;
export const CQU_STAGING_GROUP_ID = 32014;

type CoreField = Omit<DiscoveredField, 'source' | 'rawConfiguration'>;

const CORE_FIELDS: CoreField[] = [
  {
    id: 'title',
    name: 'title',
    displayName: 'Title',
    fieldType: 'text',
    required: true,
    order: 0,
    settings: { validations: { min_length: 1 } },
  },
  {
    id: 'description',
    name: 'description',
    displayName: 'Description',
    fieldType: 'textarea',
    required: true,
    order: 1,
    settings: { validations: { min_length: 1 } },
  },
  {
    id: 'keywords',
    name: 'keywords',
    displayName: 'Keywords',
    fieldType: 'list',
    required: false,
    order: 2,
  },
  {
    id: 'authors',
    name: 'authors',
    displayName: 'Authors',
    fieldType: 'authors',
    required: true,
    order: 3,
  },
  {
    id: 'categories',
    name: 'categories',
    displayName: 'Categories',
    fieldType: 'categories',
    required: false,
    order: 4,
  },
  {
    id: 'license',
    name: 'license',
    displayName: 'Licence',
    fieldType: 'license',
    required: true,
    order: 5,
  },
  {
    id: 'funding',
    name: 'funding',
    displayName: 'Funding',
    fieldType: 'text',
    required: false,
    order: 6,
  },
  {
    id: 'related_materials',
    name: 'related_materials',
    displayName: 'Related materials',
    fieldType: 'object-list',
    required: false,
    order: 7,
    settings: {
      item: {
        title: 'string',
        identifier: 'string',
        identifier_type: ['DOI', 'URL'],
      },
    },
  },
  {
    id: 'defined_type',
    name: 'defined_type',
    displayName: 'Defined type',
    fieldType: 'constant',
    required: true,
    order: 8,
    settings: { options: [CQU_DATASET_ITEM_TYPE], default_value: CQU_DATASET_ITEM_TYPE },
  },
];

/**
 * Standard fields actually emitted by the CQU ReDBox v2 dataset publisher.
 * They are a pinned integration contract, not a remotely discovered Figshare schema.
 */
export function buildCquDatasetCoreFields(groupId: number): DiscoveredField[] {
  const fields: CoreField[] = [
    ...CORE_FIELDS,
    {
      id: 'group_id',
      name: 'group_id',
      displayName: 'Group ID',
      fieldType: 'integer',
      required: true,
      order: 9,
      settings: { default_value: groupId },
    },
  ];
  return fields.map(field => {
    const rawConfiguration = {
      id: field.id,
      name: field.name,
      display_name: field.displayName,
      field_type: field.fieldType,
      is_mandatory: field.required,
      order: field.order,
      settings: field.settings ?? {},
      provenance: 'cqu-redbox-v2-dataset-contract',
    };
    return {
      ...field,
      source: 'core',
      rawConfiguration,
    };
  });
}
