import { Services as Comparison } from '../compat/sails/solr';
export namespace Services {
  export class SolrSearchService extends Comparison.SolrSearchService {}
}
declare global {
  let SolrSearchService: Services.SolrSearchService;
}
