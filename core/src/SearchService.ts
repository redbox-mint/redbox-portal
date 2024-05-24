export interface SearchService{

  index(id:string, data:any):any;
  searchFuzzy(core:string, recordtype: string, workflowState: string, searchQuery: string, exactSearches: any, facetSearches: any, brand: any, user: any, roles: any, returnFields: any, start?:number, rows?:number): Promise<any>;
  remove(id: string): any;
  searchAdvanced(core:string, recordtype: string, query: string): Promise<any>;
}