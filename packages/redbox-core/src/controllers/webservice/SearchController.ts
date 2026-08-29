import {
  APIErrorResponse,
  APIObjectActionResponse,
  BrandingModel,
  Controllers as controllers,
  RecordTypeModel,
  RecordModel,
  RecordsService,
  RoleModel,
  SearchService,
  UserModel,
  getValidatedApiRequest,
  searchRecordsRoute,
  indexRecordRoute,
  indexAllRecordsRoute,
  removeAllIndexedRoute,
  requireAllowedResource,
  requireRequestResourceAuthorization,
  asScopeKey,
} from '../../index';
import { normalizeSearchQuery } from '../../api-routes/groups/search-query';
import { firstValueFrom } from 'rxjs';

type AnyRecord = globalThis.Record<string, unknown>;

function toSearchEntries(value: unknown): Array<{ name: string; value: unknown }> {
  if (!_.isPlainObject(value)) {
    return [];
  }
  return Object.entries(value as AnyRecord).map(([name, entryValue]) => ({ name, value: entryValue }));
}

export namespace Controllers {
  /**
   * Responsible for all things related to Search
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Search extends controllers.Core.Controller {
    searchService!: SearchService;
    RecordsService!: RecordsService;

    public init(): void {
      this.registerSailsHook('after', 'ready', () => {
        this.RecordsService = sails.services.recordsservice as unknown as RecordsService;
        this.searchService = sails.services[sails.config.search.serviceName] as unknown as SearchService;
      });
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = ['init', 'search', 'index', 'indexAll', 'removeAll'];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {}

    public override async index(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { query } = validated;
        const oid = query.oid as string;
        const { context, requiredScope } = requireRequestResourceAuthorization(req);
        const record: RecordModel = requireAllowedResource(
          await this.RecordsService.getAuthorizedMeta(context, requiredScope, oid, 'update')
        );
        if (!(await this.searchService.index(oid, record))) {
          throw new Error('Index request was not accepted.');
        }

        return this.apiRespond(
          req,
          res,
          new APIObjectActionResponse(oid, 'Index request added to message queue for processing'),
          200
        );
      } catch (error) {
        return this.sendResp(req, res, { errors: [error instanceof Error ? error : new Error(String(error))] });
      }
    }

    public async indexAll(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const authorization = requireRequestResourceAuthorization(req);
      const brand: BrandingModel = requireAllowedResource(
        this.RecordsService.authorizeRecordCollection(authorization.context, authorization.requiredScope, 'update')
      );
      sails.log.verbose(`SearchController::indexAll() -> Indexing all records has been requested!`);
      const itemsPerPage = 100;
      let itemsRead = 0;
      let totalItems = 0;
      let totalPages = 0;
      let pageCount = 0;
      // keep going until we retrieve all records
      do {
        const response = await this.RecordsService.getRecords(
          undefined,
          undefined,
          itemsRead,
          itemsPerPage,
          req.user!.username,
          req.user!.roles as AnyRecord[],
          brand,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          true
        );
        if (itemsRead == 0) {
          totalItems = response.totalItems;
          totalPages = Math.ceil(totalItems / itemsPerPage);
        }
        pageCount++;
        sails.log.verbose(
          `SearchController::indexAll() -> Indexing ${totalItems} records(s), page: ${pageCount} of ${totalPages}`
        );
        itemsRead += _.size(response.items);
        for (const responseRec of response.items) {
          const responseRecObj = responseRec as Record<string, unknown> & { redboxOid?: string };
          _.unset(responseRecObj, '_id');
          if (!(await this.searchService.index(String(responseRecObj.redboxOid ?? ''), responseRecObj))) {
            throw new Error('Index request was not accepted.');
          }
        }
      } while (itemsRead < totalItems);

      sails.log.verbose(`SearchController::indexAll() -> All records submitted for indexing`);
      return this.apiRespond(
        req,
        res,
        new APIObjectActionResponse('', 'Index all records request added to message queue for processing'),
        200
      );
    }

    public async removeAll(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      sails.log.verbose(`SearchController::removeAll() -> Removing all records has been requested!`);
      const authorization = requireRequestResourceAuthorization(req);
      const brand = requireAllowedResource(
        this.RecordsService.authorizeRecordCollection(authorization.context, authorization.requiredScope, 'update')
      );
      if (typeof this.searchService.removeByBrand !== 'function') {
        throw new Error('The configured search service cannot remove one brand safely.');
      }
      await this.searchService.removeByBrand(brand.id);

      sails.log.verbose(`SearchController::indexAll() -> Submitted request to remove all`);
      return this.apiRespond(
        req,
        res,
        new APIObjectActionResponse('', 'Remove all records request added to message queue for processing'),
        200
      );
    }

    public async search(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const { query } = validated;
      const authorization = requireRequestResourceAuthorization(req);
      const brand: BrandingModel = requireAllowedResource(
        this.RecordsService.authorizeRecordCollection(authorization.context, authorization.requiredScope, 'read')
      );
      const type = query.type as string | undefined;
      const workflow = query.workflow as string | undefined;
      const searchString = query.searchStr as string | undefined;
      let core = query.core as string | undefined;
      const normalizedQuery = normalizeSearchQuery(query);
      const exactSearches = toSearchEntries(normalizedQuery.exactNames);
      const facetSearches = toSearchEntries(normalizedQuery.facetNames);

      // If a record type is set, fetch from the configuration what core it's being sent from
      if (type != null) {
        const recordType: RecordTypeModel = await firstValueFrom(RecordTypesService.get(brand, type));
        core = recordType.searchCore;
      }

      try {
        const searchRes = await this.searchService.searchFuzzy(
          core as string,
          type as string,
          workflow as string,
          searchString as string,
          exactSearches,
          facetSearches,
          brand,
          req.user! as unknown as UserModel,
          req.user!.roles as unknown as RoleModel[],
          sails.config.record.search.returnFields,
          undefined,
          undefined,
          authorization.context.effectiveScopeKeys.includes(asScopeKey('record.read.all'))
        );
        this.apiRespond(req, res, searchRes);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorResponse = new APIErrorResponse(errorMessage);
        this.sendResp(req, res, {
          errors: [error instanceof Error ? error : new Error(String(error))],
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
