interface SearchService{


  search(type, searchField, searchStr, returnFields): Promise<any>;
  searchFuzzy(type, workflowState, searchQuery, exactSearches, facetSearches, brand, user, roles, returnFields): Promise<any>;

}
export default SearchService
