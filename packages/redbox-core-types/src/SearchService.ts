import { BrandingModel, RoleModel, UserModel } from "./model";

export interface SearchService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  index(id: string, data: any): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  searchFuzzy(core: string, recordtype: string, workflowState: string, searchQuery: string, exactSearches: any, facetSearches: any, brand: BrandingModel, user: UserModel, roles: RoleModel[], returnFields: string[], start?: number, rows?: number): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  remove(id: string): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  searchAdvanced(core: string, recordtype: string, query: string): Promise<any>;
}