import { BrandingModel, RecordModel, RoleModel, UserModel } from "./model";

export interface SearchService {
  /** Resolve true only after the index job was accepted or completed inline. */
  index(id: string, data: RecordModel | Record<string, unknown>): Promise<boolean>;
  searchFuzzy(core: string, recordtype: string, workflowState: string, searchQuery: string, exactSearches: unknown, facetSearches: unknown, brand: BrandingModel, user: UserModel, roles: RoleModel[], returnFields: string[], start?: number, rows?: number): Promise<Record<string, unknown>>;
  remove(id: string): void;
  searchAdvanced(core: string, recordtype: string, query: string | URLSearchParams): Promise<Record<string, unknown>>;
}
