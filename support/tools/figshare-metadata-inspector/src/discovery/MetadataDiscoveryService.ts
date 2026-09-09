import { FigshareClient } from '../figshare/FigshareClient';
import { FigshareV2Client } from '../figshare/FigshareV2Client';
import { FigshareGroupMetadataField, FigshareInstitutionCustomField } from '../figshare/types';
import { buildCquDatasetCoreFields, CQU_DATASET_ITEM_TYPE, CQU_STAGING_GROUP_ID } from './CquDatasetContract';
import { DiscoveredField, DiscoveryEvent, MetadataDiscoveryResult } from './types';

export interface MetadataDiscoveryServiceOptions {
  groupId?: number;
  onEvent?: (event: DiscoveryEvent) => void;
}

function customField(
  groupField: FigshareGroupMetadataField,
  institutionField: FigshareInstitutionCustomField | undefined,
  groupId: number
): DiscoveredField {
  const source = institutionField == null ? 'group-custom' : 'institution-custom';
  const id = institutionField?.id ?? `group:${groupId}:${groupField.name}`;
  return {
    id,
    name: groupField.name,
    displayName: groupField.name,
    fieldType: groupField.field_type,
    required: groupField.is_mandatory,
    settings: groupField.settings,
    order: groupField.order,
    source,
    rawDefinition: institutionField?.raw,
    rawConfiguration: groupField.raw,
  };
}

export class MetadataDiscoveryService {
  private readonly groupId: number;
  private readonly onEvent?: (event: DiscoveryEvent) => void;
  private readonly v2: FigshareV2Client;

  public constructor(client: FigshareClient, options?: MetadataDiscoveryServiceOptions);
  public constructor(v2: FigshareV2Client, options?: MetadataDiscoveryServiceOptions);
  public constructor(clientOrV2: FigshareClient | FigshareV2Client, options: MetadataDiscoveryServiceOptions = {}) {
    this.groupId = options.groupId ?? CQU_STAGING_GROUP_ID;
    if (!Number.isSafeInteger(this.groupId) || this.groupId < 1) {
      throw new Error(`Invalid Figshare group id: ${String(this.groupId)}`);
    }
    this.v2 = clientOrV2 instanceof FigshareClient ? new FigshareV2Client(clientOrV2) : clientOrV2;
    this.onEvent = options.onEvent;
  }

  public async discover(): Promise<MetadataDiscoveryResult> {
    const [institutionCustomFields, groupItemMetadata, licenses, categories] = await Promise.all([
      this.v2.getInstitutionCustomFields(),
      this.v2.getGroupItemMetadata(this.groupId),
      this.v2.getLicenses(),
      this.v2.getCategories(),
    ]);
    const coreFields = buildCquDatasetCoreFields(this.groupId);
    const institutionByName = new Map(institutionCustomFields.map(field => [field.name, field]));
    const fields = [
      ...coreFields,
      ...groupItemMetadata
        .map(field => customField(field, institutionByName.get(field.name), this.groupId))
        .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)),
    ];

    this.onEvent?.({ kind: 'core-fields', count: coreFields.length });
    this.onEvent?.({ kind: 'institution-fields', count: institutionCustomFields.length });
    this.onEvent?.({ kind: 'group-fields', groupId: this.groupId, count: groupItemMetadata.length });
    this.onEvent?.({ kind: 'licenses', count: licenses.length });
    this.onEvent?.({ kind: 'categories', count: categories.length });

    return {
      target: { itemType: CQU_DATASET_ITEM_TYPE, groupId: this.groupId },
      fields,
      licenses,
      categories,
      raw: {
        coreFields: coreFields.map(field => field.rawConfiguration),
        institutionCustomFields,
        groupItemMetadata,
        licenses,
        categories,
      },
    };
  }
}
