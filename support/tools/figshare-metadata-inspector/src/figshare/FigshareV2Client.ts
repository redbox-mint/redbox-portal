import { FigshareClient } from './FigshareClient';
import {
  FigshareCategory,
  FigshareCategoryApiResponse,
  FigshareCategorySchema,
  FigshareGroupMetadataField,
  FigshareGroupMetadataFieldApiResponse,
  FigshareGroupMetadataFieldSchema,
  FigshareInstitutionCustomField,
  FigshareInstitutionCustomFieldApiResponse,
  FigshareInstitutionCustomFieldSchema,
  FigshareLicense,
  FigshareLicenseApiResponse,
  FigshareLicenseSchema,
} from './types';
import { parseResponseList } from './validation';

export class FigshareV2Client {
  public constructor(private readonly client: FigshareClient) {}

  public async getLicenses(): Promise<FigshareLicense[]> {
    const endpoint = '/v2/account/licenses';
    const response = await this.client.get<unknown>(endpoint);
    return parseResponseList<FigshareLicenseApiResponse>(response, endpoint, FigshareLicenseSchema).map(license => ({
      ...license,
      id: license.id ?? (license.value as string | number),
    }));
  }

  public async getCategories(): Promise<FigshareCategory[]> {
    const endpoint = '/v2/account/categories';
    const values = await this.client.get<unknown>(endpoint);
    return parseResponseList<FigshareCategoryApiResponse>(values, endpoint, FigshareCategorySchema).map(category => ({
      ...category,
      title: category.title ?? (category.name as string),
    }));
  }

  public async getInstitutionCustomFields(): Promise<FigshareInstitutionCustomField[]> {
    const endpoint = '/v2/account/institution/custom_fields';
    const response = await this.client.get<unknown>(endpoint);
    return parseResponseList<FigshareInstitutionCustomFieldApiResponse>(
      response,
      endpoint,
      FigshareInstitutionCustomFieldSchema
    );
  }

  public async getGroupItemMetadata(groupId: number): Promise<FigshareGroupMetadataField[]> {
    if (!Number.isSafeInteger(groupId) || groupId < 1) {
      throw new Error(`Invalid Figshare group id: ${String(groupId)}`);
    }
    const endpoint = `/v2/account/groups/${groupId}/metadata/item`;
    const response = await this.client.get<unknown>(endpoint);
    return parseResponseList<FigshareGroupMetadataFieldApiResponse>(
      response,
      endpoint,
      FigshareGroupMetadataFieldSchema
    );
  }
}
