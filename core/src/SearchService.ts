export interface SearchService{

  index(id:string, data:any):any;
  searchFuzzy(type, workflowState, searchQuery, exactSearches, facetSearches, brand, user, roles, returnFields, start?:number, rows?:number): Promise<any>;
  remove(id: string): any;
  searchAdvanced(query): Promise<any>;
}