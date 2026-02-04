export class VocabQueryConfig {
  querySource: VocabQuerySource = VocabQuerySource.solr;
  databaseQuery: VocabDatabaseQueryConfig = new VocabDatabaseQueryConfig();
  searchQuery: VocabSolrQueryConfig = new VocabSolrQueryConfig();
  queryField: VocabQueryFieldConfig = new VocabQueryFieldConfig();
  userQueryFields: VocabUserQueryFieldConfig[] = [];
  resultObjectMapping: {
    [key: string]: string;
  } = {};
}

export enum VocabQuerySource {
  solr = 'solr',
  database = 'database'
}
  
export class VocabDatabaseQueryConfig {
  queryName: string = '';
}
  
export class VocabSolrQueryConfig {
  baseQuery: string = '';
  searchCore: string = 'default';
}
  
export class VocabQueryFieldConfig {
  property: string = '';
  type: string = '';
}

export declare class VocabUserQueryFieldConfig {
  property: string;
  userValueProperty: string;
}
  