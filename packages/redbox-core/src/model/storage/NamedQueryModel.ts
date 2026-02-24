import { BrandingModel } from "./BrandingModel";

export class NamedQueryModel {
    key: string = '';
    name: string = '';
    branding: BrandingModel = new BrandingModel();
    mongoQuery: string = '';
    queryParams: string = '';
    collectionName?: string;
    resultObjectMapping?: string;
    brandIdFieldPath?: string;
    sort?: string;
  }