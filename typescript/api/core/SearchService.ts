interface SearchService{

  index(id:string, data:any):any;
  searchFuzzy(type, workflowState, searchQuery, exactSearches, facetSearches, brand, user, roles, returnFields): Promise<any>;
  remove(id: string): any;
  searchAdvanced(query): Promise<any>;
}
export default SearchService
