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

    public bootstrap() { }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private errorStatus(error: unknown): number {
      const message = this.asError(error).message;
      if (/not found|no such/i.test(message)) {
        return 404;
      }
      if (/invalid|malformed|not valid|conflict/i.test(message)) {
        return 400;
      }
      const errObj = error as { statusCode?: number; status?: number };
      if (typeof errObj?.statusCode === 'number' && errObj.statusCode >= 400 && errObj.statusCode < 600) {
        return errObj.statusCode;
      }
      if (typeof errObj?.status === 'number' && errObj.status >= 400 && errObj.status < 600) {
        return errObj.status;
      }
      return 500;
    }

    public override async index(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { query } = validated;
        const oid = query.oid as string;
        if (!oid) {
          return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'oid is required' }], headers: this.getNoCacheHeaders() });
        }
        const record: RecordModel = await this.RecordsService.getMeta(oid);
        if (!record || _.isEmpty(record)) {
          return this.sendResp(req, res, { status: 404, displayErrors: [{ detail: `Record not found: ${oid}` }], headers: this.getNoCacheHeaders() });
        }
        await this.searchService.index(oid, record);

        return this.apiRespond(
          req,
          res,
          new APIObjectActionResponse(oid, 'Index request added to message queue for processing'),
          200
        );
      } catch (error) {
        return this.sendResp(req, res, { status: this.errorStatus(error), errors: [this.asError(error)], displayErrors: [{ detail: 'Index record failed.' }], headers: this.getNoCacheHeaders() });
      }
    }

    public async indexAll(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
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
          undefined
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
          await this.searchService.index(String(responseRecObj.redboxOid ?? ''), responseRecObj);
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

      // delete all documents by specifying id as '*'
      await this.searchService.remove('*');

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
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      const type = query.type as string | undefined;
      const workflow = query.workflow as string | undefined;
      const searchString = query.searchStr as string | undefined;
      let core = query.core as string | undefined;
      const normalizedQuery = normalizeSearchQuery(query);
      const exactSearches = toSearchEntries(normalizedQuery.exactNames);
      const facetSearches = toSearchEntries(normalizedQuery.facetNames);

      // If a record type is set, fetch from the configuration what core it's being sent from.
      // Guard against blank/unknown types so a missing record type yields a 404 instead of a
      // crash when dereferencing `searchCore`.
      if (type) {
        const recordType: RecordTypeModel | undefined = await firstValueFrom(RecordTypesService.get(brand, type));
        if (!recordType) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: `Record type not found: ${type}` }],
            headers: this.getNoCacheHeaders(),
          });
        }
        core = recordType.searchCore;
      }

      // An empty `core` query parameter must fall back to the default Solr core rather than
      // overriding searchFuzzy's default with an empty string (which resolves to no core).
      const resolvedCore = _.isEmpty(core) ? undefined : core;

      try {
        const searchRes = await this.searchService.searchFuzzy(
          resolvedCore as string,
          type as string,
          workflow as string,
          searchString as string,
          exactSearches,
          facetSearches,
          brand,
          req.user! as unknown as UserModel,
          req.user!.roles as unknown as RoleModel[],
          sails.config.record.search.returnFields
        );
        this.apiRespond(req, res, searchRes);
      } catch (error: unknown) {
        sails.log.error(`SearchController.search error: ${this.asError(error).message}`, error);
        this.sendResp(req, res, {
          status: this.errorStatus(error),
          errors: [this.asError(error)],
          displayErrors: [{ detail: 'Search failed.' }],
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
