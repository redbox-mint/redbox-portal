// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { Observable, of, from } from 'rxjs';
import { mergeMap as flatMap, last, concatMap, delay } from 'rxjs/operators';
import { SearchService } from '../SearchService';
import { VocabQueryConfig } from '../model/config/VocabQueryConfig';
import { BrandingModel } from '../model/storage/BrandingModel';
import { Services as services } from '../CoreService';
import type { VocabularyWaterlineModel } from '../waterline-models/Vocabulary';
import type { VocabularyEntryWaterlineModel } from '../waterline-models/VocabularyEntry';
import axios, { AxiosResponse } from 'axios';


export namespace Services {
  type AdditionalInfoRecord = { message: string; isSuccess: boolean };
  type VocabUserContext = Record<string, unknown> & { additionalInfoFound?: AdditionalInfoRecord[]; additionalAttributes?: Record<string, unknown>; name?: string };
  type MintTriggerOptions = { sourceType?: string; queryString?: string; fieldsToMap?: string[] };
  type ExternalServiceParams = { options: Record<string, unknown>; postBody?: unknown };
  type ManagedVocabulary = { id: string | number };
  type ManagedVocabularyEntry = {
    label?: unknown;
    value?: unknown;
    identifier?: unknown;
    historical?: unknown;
  };
  type ManagedVocabOption = { uri: string; notation: string; label: string; historical: boolean };
  /**
   * Vocab related services...
   *
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Vocab extends services.Core.Service {

    protected override _exportedMethods: string[] = [
      'bootstrap',
      'getVocab',
      'loadCollection',
      'findCollection',
      'findInMint',
      'findInExternalService',
      'rvaGetResourceDetails',
      'findInMintTriggerWrapper',
      'findRecords'
    ];

    /** @deprecated Legacy bootstrap flow for deprecated vocab API. */
    public bootstrap() {
      return _.isEmpty(sails.config.vocab.bootStrapVocabs) ?
        of(null)
        : from(sails.config.vocab.bootStrapVocabs as string[]).pipe(
          flatMap((vocabId: string) => {
            return this.getVocab(vocabId);
          }),
          last()
        );
    }

    /** @deprecated Legacy Mint trigger wrapper. */
    public async findInMintTriggerWrapper(user: VocabUserContext, options: MintTriggerOptions, failureMode: string) {
      let additionalInfoFound = _.get(user, 'additionalInfoFound') as Array<AdditionalInfoRecord> | undefined;
      if (!_.isArray(additionalInfoFound)) {
        additionalInfoFound = [];
      }
      try {
        const sourceType = _.get(options, 'sourceType', '');
        const queryStringTmp = _.get(options, 'queryString', '');
        const compiledTemplate = _.template(queryStringTmp, {});
        const fieldsToMap = _.get(options, 'fieldsToMap', []);

        const queryString = compiledTemplate({ user: user });
        const mintResponse = await this.findInMint(sourceType, queryString);
        const responseDocs = _.get(mintResponse, 'response.docs');
        if (_.isArray(responseDocs) && responseDocs.length > 0) {

          for (const fieldName of fieldsToMap) {
            const sourceField = _.get(responseDocs[0], fieldName);
            if (!_.isUndefined(sourceField) && !_.isEmpty(sourceField) && !_.isNull(sourceField)) {
              _.set(user, 'additionalAttributes.' + fieldName, sourceField);
            }
          }
          this.setSuccessOrFailure(user, additionalInfoFound, '', true);

        } else {

          this.setSuccessOrFailure(user, additionalInfoFound, failureMode);
        }

        return user;

      } catch (err) {
        sails.log.error(`findInMintTriggerWrapper failed to complete. Additional info for user ${_.get(user, 'name')} not found`);
        sails.log.error(err);
        sails.log.error(options);
        this.setSuccessOrFailure(user, additionalInfoFound, failureMode);
        return user;
      }
    }

    private setSuccessOrFailure(user: VocabUserContext, additionalInfoFound: Array<AdditionalInfoRecord>, failureMode: string, forceSuccess: boolean = false) {

      if (forceSuccess) {

        const successResponse: AdditionalInfoRecord = {
          message: `Additional info for user ${_.get(user, 'name')} found.`,
          isSuccess: true
        };
        additionalInfoFound.push(successResponse);
        _.set(user, 'additionalInfoFound', additionalInfoFound);

      } else if (failureMode == 'continue') {

        const successResponse: AdditionalInfoRecord = {
          message: `Additional info for user ${_.get(user, 'name')} not found. Ignore because failure mode is set to ${failureMode}`,
          isSuccess: true
        };
        additionalInfoFound.push(successResponse);
        _.set(user, 'additionalInfoFound', additionalInfoFound);

      } else {
        const errorResponse: AdditionalInfoRecord = {
          message: `Additional info for user ${_.get(user, 'name')} not found`,
          isSuccess: false
        };
        additionalInfoFound.push(errorResponse);
        _.set(user, 'additionalInfoFound', additionalInfoFound);
      }
    }

    /** @deprecated Legacy Mint integration. */
    public async findInMint(sourceType: string, queryString: string): Promise<Record<string, unknown>> {
      queryString = _.trim(queryString);
      let searchString = '';
      if (!_.isEmpty(queryString)) {
        searchString = ` AND (${queryString})`;
      }

      const mintUrl = `${sails.config.record.baseUrl.mint}${sails.config.mint.api.search.url}?q=repository_type:${sourceType}${searchString}&version=2.2&wt=json&start=0`;
      sails.log.info(mintUrl);
      const options = this.getMintOptions(mintUrl, sails.config.record.api.search.method);
      sails.log.verbose(options);

      const response = await axios(options);
      return response.data as Record<string, unknown>;
    }

    /** @deprecated Legacy record query implementation. */
    public async findRecords(sourceType: string, brand: BrandingModel, searchString: string, start: number, rows: number, user: VocabUserContext): Promise<Record<string, unknown> | Array<Record<string, unknown>>> {

      const queryConfig = sails.config.vocab.queries[sourceType] as unknown as VocabQueryConfig;

      if (queryConfig.querySource == 'database') {

        const namedQueryConfig = await NamedQueryService.getNamedQueryConfig(brand, queryConfig.databaseQuery.queryName);
        const paramMap = this.buildNamedQueryParamMap(queryConfig, searchString, user);
        const dbResults = await NamedQueryService.performNamedQueryFromConfig(namedQueryConfig, paramMap, brand, start, rows);
        if (queryConfig.resultObjectMapping) {
          return this.getResultObjectMappings(dbResults as unknown as Record<string, unknown>, queryConfig);
        } else {
          return dbResults as unknown as Record<string, unknown>;
        }
      } else if (queryConfig.querySource == 'solr') {
        const solrQuery = this.buildSolrParams(brand, searchString, queryConfig, start, rows, 'json', user);
        const solrResults = await this.getSearchService().searchAdvanced(queryConfig.searchQuery.searchCore, '', solrQuery);
        if (queryConfig.resultObjectMapping) {
          return this.getResultObjectMappings(solrResults, queryConfig);
        } else {
          return solrResults;
        }
      }
      return {};
    }

    buildNamedQueryParamMap(queryConfig: VocabQueryConfig, searchString: string, user: VocabUserContext): Record<string, unknown> {
      const paramMap: Record<string, unknown> = {}
      if (queryConfig.queryField.type == 'text') {
        paramMap[queryConfig.queryField.property] = searchString;
      }
      if (queryConfig.userQueryFields != null) {
        for (const userQueryField of queryConfig.userQueryFields) {
          paramMap[userQueryField.property] = _.get(user, userQueryField.userValueProperty, null);
        }
      }
      return paramMap;
    }

    private buildSolrParams(brand: BrandingModel, searchString: string, queryConfig: VocabQueryConfig, start: number, rows: number, format: string = 'json', user: VocabUserContext): string {
      let query = `${queryConfig.searchQuery.baseQuery}&sort=date_object_modified desc&version=2.2&start=${start}&rows=${rows}`;
      query = query + `&fq=metaMetadata_brandId:${brand.id}&wt=${format}`;

      if (queryConfig.queryField.type == 'text') {
        const value = searchString;
        if (!_.isEmpty(value)) {
          const searchProperty = queryConfig.queryField.property;
          query = query + '&fq=' + searchProperty + ':';
          if (value.indexOf('*') != -1) {
            query = query + value.replaceAll('*', '') + '*';
          } else {
            query = query + value + '*';
          }
        }
      }

      if (queryConfig.userQueryFields != null) {
        for (const userQueryField of queryConfig.userQueryFields) {
          const searchProperty = userQueryField.property;
          query = query + '&fq=' + searchProperty + ':' + _.get(user, userQueryField.userValueProperty, null);
        }
      }

      return query;
    }

    getResultObjectMappings(results: Record<string, unknown>, queryConfig: VocabQueryConfig): Array<Record<string, unknown>> {

      let responseRecords = _.get(results, 'response.docs', '') as Array<Record<string, unknown>> | '';
      if (responseRecords == '') {
        responseRecords = (results as { records?: Array<Record<string, unknown>> }).records ?? [];
      }
      const response: Array<Record<string, unknown>> = [];
      const that = this;
      const resultObjectMapping = queryConfig.resultObjectMapping;
      for (const record of responseRecords) {
        try {
          const variables = {
            record: record,
            _: _
          };
          let defaultMetadata: Record<string, unknown> = {};
          if (!_.isEmpty(resultObjectMapping)) {
            const resultMetadata = _.cloneDeep(resultObjectMapping);
            _.forOwn(resultObjectMapping, function (value: unknown, key: string) {
              _.set(resultMetadata, key, that.runTemplate(value as string, variables));
            });
            defaultMetadata = resultMetadata as Record<string, unknown>;
            response.push(defaultMetadata);
          }
        } catch (_error) {
          //This is required because the records retrieved from the solr index can have different structure and runTemplate method 
          //cannot handle this .i.e if there are records type rdmp thar normal rdmp records and there are mock mint records that 
          //are also rdmp type when the mock mint records are set to a different record type this should not happen 
          continue;
        }
      }
      return response;
    }

    private getSearchService(): SearchService {
      return sails.services[sails.config.search.serviceName] as unknown as SearchService;
    }

    private runTemplate(templateOrPath: string, variables: Record<string, unknown>) {
      if (templateOrPath && templateOrPath.indexOf('<%') != -1) {
        return _.template(templateOrPath)(variables);
      }
      return _.get(variables, templateOrPath);
    }

    /** @deprecated Legacy external service proxy. */
    public async findInExternalService(providerName: string, params: ExternalServiceParams): Promise<Record<string, unknown>> {
      const method = sails.config.vocab.external[providerName].method;
      let url = sails.config.vocab.external[providerName].url;

      const templateFunction = this.getTemplateStringFunction(url);
      url = templateFunction(params.options);

      sails.log.info(url);
      const options = sails.config.vocab.external[providerName].options;

      if (method == 'post') {
        const post = {
          method: method,
          url: url,
          data: params.postBody,
          params: options
        };
        sails.log.verbose(post);

        const response = await axios(post);
        return response.data as Record<string, unknown>;
      } else {
        const getSearch = {
          method: method,
          url: url,
          params: options
        };
        sails.log.verbose(getSearch);

        const response = await axios(getSearch);
        return response.data as Record<string, unknown>;
      }
    }

    private getTemplateStringFunction(template: string) {
      const sanitized = template
        .replace(/\$\{([\s]*[^;\s\{]+[\s]*)\}/g, function (_: string, match: string) {
          return `\$\{map.${match.trim()}\}`;
        })
        // Afterwards, replace anything that's not ${map.expressions}' (etc) with a blank string.
        .replace(/(\$\{(?!map\.)[^}]+\})/g, '');

      return Function('map', `return \`${sanitized}\``);
    }


    /** @deprecated Use VocabularyService.getEntries() or FormVocabularyController endpoints. */
    public getVocab = (vocabId: string): Observable<Array<{ uri: string; notation: string; label: string }> | unknown> => {
      // Check cache
      return from(CacheService.get(vocabId)).pipe(
        flatMap(data => {
          if (data) {
            sails.log.verbose(`Returning cached vocab: ${vocabId}`);
            return of(data);
          }
          return from(this.getManagedVocabulary(vocabId)).pipe(
            flatMap((managedVocabulary) => {
              if (managedVocabulary) {
                CacheService.set(vocabId, managedVocabulary);
                return of(managedVocabulary);
              }

              if (sails.config.vocab.nonAnds && sails.config.vocab.nonAnds[vocabId]) {
                return this.getNonAndsVocab(vocabId);
              }
              const url = `${sails.config.vocab.rootUrl}${vocabId}/${sails.config.vocab.conceptUri}`;
              let items: Array<{ uri: string; notation: string; label: string }> | null = null; // a flat array containing all the entries
              const rawItems: Array<unknown> = [];
              return this.getConcepts(url, rawItems).pipe(
                flatMap(allRawItems => {
                  // we only are interested in notation, label and the uri
                  items = _.map(allRawItems, (rawItem: unknown) => {
                    const rawItemObj = rawItem as Record<string, unknown>;
                    const prefLabel = rawItemObj.prefLabel as { _value?: string } | undefined;
                    return { uri: rawItemObj._about as string, notation: rawItemObj.notation as string, label: prefLabel?._value ?? '' };
                  });
                  CacheService.set(vocabId, items);
                  return of(items);
                })
              );
            })
          );
        })
      );
    }

    private async getManagedVocabulary(vocabId: string): Promise<ManagedVocabOption[] | null> {




      const normalizedId = String(vocabId ?? '').trim();
      if (!normalizedId) {
        return null;
      }

      const vocabulary = await Vocabulary.findOne({
        or: [{ id: normalizedId }, { slug: normalizedId }, { name: normalizedId }]
      }) as ManagedVocabulary | null;
      if (!vocabulary?.id) {
        return null;
      }

      const entries = await VocabularyEntry
        .find({ vocabulary: vocabulary.id })
        .sort('order ASC label ASC') as ManagedVocabularyEntry[];

      return entries.map((entry) => ({
        uri: String(entry.identifier ?? entry.value ?? ''),
        notation: String(entry.value ?? ''),
        label: String(entry.label ?? ''),
        historical: this.toBoolean(entry.historical)
      }));
    }

    private toBoolean(value: unknown): boolean {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'number') {
        return value !== 0;
      }
      const normalized = String(value ?? '').trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
    }

    // have to do this since ANDS endpoint ignores _pageSize
    protected getConcepts(url: string, rawItems: Array<unknown>): Observable<Array<unknown>> {
      console.log(`Getting concepts....${url}`);
      return from(axios.get(url)).pipe(
        flatMap((resp): Observable<Array<unknown>> => {
          const response = resp.data as { result?: { items?: Array<unknown>; next?: string } };
          rawItems = rawItems.concat(response.result?.items ?? []);
          if (response.result && response.result.next) {
            return this.getConcepts(response.result.next, rawItems);
          }
          return of(rawItems);
        })
      );
    }

    protected getNonAndsVocab(vocabId: string): Observable<AxiosResponse<unknown>> {
      const url = sails.config.vocab.nonAnds[vocabId].url;
      return from(axios.get(url)).pipe(flatMap(response => {
        CacheService.set(vocabId, response.data);
        return of(response);
      }));
    }

    /** @deprecated Managed via Vocabulary admin. */
    loadCollection(collectionId: string, progressId: string | null = null, force = false) {
      const progressKey = progressId ?? '';
      const getMethod = sails.config.vocab.collection[collectionId].getMethod;
      const bufferCount = sails.config.vocab.collection[collectionId].processingBuffer;
      const processWindow = sails.config.vocab.collection[collectionId].processingTime;
      let collectionData: Array<unknown> | null = null;
      return (this as unknown as Record<string, (id: string) => Observable<unknown>>)[getMethod](collectionId).pipe(flatMap((data: unknown) => {
        if (_.isEmpty(data) || force) {
          // return a receipt and then start the process of loading...
          const url = sails.config.vocab.collection[collectionId].url;
          sails.log.verbose(`Loading collection: ${collectionId}, using url: ${url}`);
          const methodName = sails.config.vocab.collection[collectionId].saveMethod;
          return from(axios.get(url)).pipe(
            flatMap(resp => {
              const response = resp.data as Array<unknown>;
              sails.log.verbose(`Got response retrieving data for collection: ${collectionId}, saving...`);
              sails.log.verbose(`Number of items: ${response.length}`);
              const itemsToSave = _.chunk(response, bufferCount);
              collectionData = itemsToSave;
              // sails.log.verbose(collectionData);
              const updateObj = { currentIdx: 0, targetIdx: (collectionData || []).length };
              return AsynchsService.update({ id: progressKey }, updateObj);
            }),
            flatMap(_updateResp => {
              sails.log.verbose(`Updated asynch progress...`);
              return from(collectionData || []);
            }),
            concatMap((buffer: unknown, i: number) => {
              sails.log.verbose(`Processing chunk: ${i}`);
              return of(buffer).pipe(
                delay(i * processWindow),
                flatMap(() => this.saveCollectionChunk(methodName, buffer, i).pipe(
                  flatMap(_saveResp => {
                    sails.log.verbose(`Updating chunk progress...${i}`);
                    if (i === (collectionData || []).length - 1) {
                      sails.log.verbose(`Asynch completed.`);
                      return AsynchsService.finish(progressKey);
                    } else {
                      return AsynchsService.update({ id: progressKey }, { currentIdx: i + 1, status: 'processing' });
                    }
                  })
                ))
              );
            })
          )
        } else {
          sails.log.verbose(`Collection already loaded: ${collectionId}`);
          return of(null);
        }
      }));
    }

    protected saveCollectionChunk(methodName: string, buffer: unknown, _i: number) {
      return (this as unknown as Record<string, (buf: unknown) => Observable<unknown>>)[methodName](buffer);
    }

    /** @deprecated Managed via Vocabulary admin. */
    findCollection(collectionId: string, searchString: string) {
      return (this as unknown as Record<string, (value: string) => Observable<unknown>>)[sails.config.vocab.collection[collectionId].searchMethod](searchString);
    }

    /** @deprecated Legacy ANDS/RVA lookup. */
    public rvaGetResourceDetails(uri: string, vocab: string): Observable<AxiosResponse<unknown>> {
      const url = sails.config.vocab.rootUrl + `${vocab}/resource.json?uri=${uri}`;
      return from(axios.get(url)).pipe(flatMap(response => {
        CacheService.set(vocab, response.data);
        return of(response);
      }));
    }

    protected getMintOptions(url: string, method: string, contentType = 'application/json; charset=utf-8') {

      const opts = {
        method: method,
        url: url,
        headers: {
          'Authorization': `Bearer ${sails.config.mint.apiKey}`,
          'Content-Type': contentType
        }
      };

      return opts;
    }
  }
}

declare global {
  let VocabService: Services.Vocab;
}
