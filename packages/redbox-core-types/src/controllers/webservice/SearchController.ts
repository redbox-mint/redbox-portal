import { APIErrorResponse, APIObjectActionResponse, BrandingModel, Controllers as controllers, RecordTypeModel, RecordModel, RecordsService, SearchService } from '../../index';
import { firstValueFrom } from 'rxjs';

declare var sails: any;
declare var BrandingService: any;
declare var RecordTypesService: any;
declare var _: any;

export module Controllers {
  /**
   * Responsible for all things related to Search
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Search extends controllers.Core.Controller {

    searchService: SearchService;
    RecordsService: RecordsService;

    public init(): void {
      this.registerSailsHook('after', 'ready', () => {
        this.RecordsService = sails.services.recordsservice;
        this.searchService = sails.services[sails.config.search.serviceName];
      });
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'init',
      'search',
      'index',
      'indexAll',
      'removeAll'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public async index(req, res) {
      let oid = req.param('oid');
      let record: RecordModel = await this.RecordsService.getMeta(oid);
      await this.searchService.index(oid, record);

      return this.apiRespond(req, res, new APIObjectActionResponse(oid, "Index request added to message queue for processing"), 200)
    }

    public async indexAll(req, res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      sails.log.verbose(`SearchController::indexAll() -> Indexing all records has been requested!`);
      let itemsPerPage = 100;
      let itemsRead = 0;
      let totalItems = 0;
      let totalPages = 0;
      let pageCount = 0;
      // keep going until we retrieve all records
      do {
        let response = await this.RecordsService.getRecords(undefined, undefined, itemsRead, itemsPerPage, req.user.username, req.user.roles, brand, undefined, undefined, undefined, undefined, undefined);
        if (itemsRead == 0) {
          totalItems = response.totalItems;
          totalPages = Math.ceil(totalItems / itemsPerPage);
        }
        pageCount++;
        sails.log.verbose(`SearchController::indexAll() -> Indexing ${totalItems} records(s), page: ${pageCount} of ${totalPages}`);
        itemsRead += _.size(response.items);
        for (let responseRec of response.items) {
          _.unset(responseRec, '_id');
          await this.searchService.index(responseRec.redboxOid, responseRec);
        }
      } while (itemsRead < totalItems)

      sails.log.verbose(`SearchController::indexAll() -> All records submitted for indexing`);
      return this.apiRespond(req, res, new APIObjectActionResponse("", "Index all records request added to message queue for processing"), 200);
    }

    public async removeAll(req, res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      sails.log.verbose(`SearchController::removeAll() -> Removing all records has been requested!`);

      // delete all documents by specifying id as '*'
      await this.searchService.remove('*');

      sails.log.verbose(`SearchController::indexAll() -> Submitted request to remove all`);
      return this.apiRespond(req, res, new APIObjectActionResponse("", "Remove all records request added to message queue for processing"), 200);
    }

    public async search(req, res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      const type = req.query.type;
      const workflow = req.query.workflow;
      const searchString = req.query.searchStr;
      let core = req.query.core;
      const exactSearchNames = _.isEmpty(req.query.exactNames) ? [] : req.query.exactNames.split(',');
      const exactSearches = [];
      const facetSearchNames = _.isEmpty(req.query.facetNames) ? [] : req.query.facetNames.split(',');
      const facetSearches = [];

      // If a record type is set, fetch from the configuration what core it's being sent from
      if (type != null) {
        let recordType: RecordTypeModel = await firstValueFrom(RecordTypesService.get(brand, type));
        core = recordType.searchCore;
      }

      _.forEach(exactSearchNames, (exactSearch) => {
        exactSearches.push({
          name: exactSearch,
          value: req.query[`exact_${exactSearch}`]
        });
      });
      _.forEach(facetSearchNames, (facetSearch) => {
        facetSearches.push({
          name: facetSearch,
          value: req.query[`facet_${facetSearch}`]
        });
      });

      try {
        const searchRes = await this.searchService.searchFuzzy(core, type, workflow, searchString, exactSearches, facetSearches, brand, req.user, req.user.roles, sails.config.record.search.returnFields);
        this.apiRespond(req, res, searchRes);
      } catch (error) {
        this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }


    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
