import { BrandingModel, RoleModel, UserModel } from "./model";

export interface SearchService{

  index(id:string, data:any):any;
  searchFuzzy(core:string, recordtype: string, workflowState: string, searchQuery: string, exactSearches: any, facetSearches: any, brand: BrandingModel, user: UserModel, roles: RoleModel[], returnFields: string[], start?:number, rows?:number): Promise<any>;
  remove(id: string): any;
  searchAdvanced(core:string, recordtype: string, query: string): Promise<any>;
}