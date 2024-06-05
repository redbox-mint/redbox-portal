export class VocabQueryConfig {
  querySource: VocabQuerySource = VocabQuerySource.solr;
  databaseQuery: VocabDatabaseQueryConfig;
  searchQuery: VocabSolrQueryConfig;
  queryField: VocabQueryFieldConfig;
  resultObjectMapping: {
    [key: string]: string;
  };
}

export enum VocabQuerySource {
  solr = 'solr',
  database = 'database'
}
  
export class VocabDatabaseQueryConfig {
  queryName: string;
}
  
export class VocabSolrQueryConfig {
  baseQuery: string;
  searchCore: string = 'default';
}
  
export class VocabQueryFieldConfig {
  property: string;
  type: string;
}
  