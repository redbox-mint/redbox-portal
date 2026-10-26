// Copyright (c) 2020 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

import { QueueService } from '../QueueService';
import { SearchService } from '../SearchService';
import type { SolrSearchConfig, SolrCoreConfig, SolrCoreOptions, SolrCoreSchema, SolrFieldDefinition, SolrCopyFieldDefinition } from '../config/solr.config';
import { SOLR_EXACT_ACL_FIELDS, SOLR_EXACT_ACL_VERSION } from '../config/solr.config';
import { BrandingModel } from '../model/storage/BrandingModel';
import { UserModel } from '../model/storage/UserModel';
import { RoleModel } from '../model/storage/RoleModel';
import { RecordModel } from '../model/storage/RecordModel';
import { SolrDocument } from '../model/SolrDocument';
import { Services as services } from '../CoreService';
import { DateTime } from 'luxon';

type SolrOptions = SolrCoreOptions;
type SolrCore = SolrCoreConfig;
type SolrConfig = SolrSearchConfig;

const axios = require('axios');
// Bound both socket inactivity and total elapsed time for every startup request.
// waitTime is already the configured Solr readiness interval; zero must not disable timeouts.
function solrSetupRequestOptions(): { timeout: number; signal: AbortSignal } {
  const configured = Number(sails.config.solr.waitTime);
  const timeout = Number.isFinite(configured) && configured > 0 ? Math.ceil(configured) : 5000;
  return { timeout, signal: AbortSignal.timeout(timeout) };
}

type FlatModule = { flatten: (obj: Record<string, unknown>, options?: Record<string, unknown>) => Record<string, unknown> };
type LuceneEscapeQueryModule = ((value: string) => string) | { escape?: (value: string) => string; default?: (value: string) => string };
let flat: FlatModule | null = null;
const luceneEscapeQueryModule: LuceneEscapeQueryModule = require("lucene-escape-query");
const luceneEscapeQuery: (value: string) => string =
  typeof luceneEscapeQueryModule === 'function'
    ? luceneEscapeQueryModule
    : (luceneEscapeQueryModule?.escape || luceneEscapeQueryModule?.default || ((value: string) => value));

/**
 * Convert full ISO calendar dates and native dates to UTC for Solr.
 * Leave incomplete or invalid values unchanged instead of inventing missing date parts.
 */
function normalizeSolrDateValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeSolrDateValue);
  }
  if (value instanceof Date) {
    const date = DateTime.fromJSDate(value, { zone: 'utc' });
    return date.isValid ? date.toUTC().toISO() ?? value : value;
  }
  if (typeof value !== 'string' || !/^(?:[+-]\d{6}|\d{4})-?\d{2}-?\d{2}(?:T|$)/.test(value)) {
    return value;
  }
  const date = DateTime.fromISO(value, { zone: 'utc', setZone: true });
  return date.isValid ? date.toUTC().toISO() ?? value : value;
}

function exactAclValues(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).filter((entry): entry is string => typeof entry === 'string');
}

// These names may have incompatible persisted DocValues from the first rollout.
// Leave their schema untouched and never send them in newly indexed documents.
const RETIRED_EXACT_ACL_FIELD_NAMES = [
  'authorization_view_exact', 'authorization_edit_exact',
  'authorization_viewRoles_exact', 'authorization_editRoles_exact',
  'metaMetadata_brandId_exact', 'authorization_exact_version'
];

class SolrClient {
  options: SolrOptions;
  axios: { post: (url: string, body: unknown) => Promise<unknown> };
  autoCommit: boolean = true;
  constructor(options: SolrOptions) {
    this.options = options;
    const baseUrl = `${this.options.https ? 'https' : 'http'}://${this.options.host}:${this.options.port}/solr/${this.options.core}/`;
    this.axios = axios.create({
      baseURL: baseUrl,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  public async add(doc: Record<string, unknown>): Promise<void> {
    try {
      await this.axios.post('/update', [doc]);
      if (this.autoCommit) {
        await this.commit();
      }
    } catch (err) {
      console.error('Failed to add document to Solr:', err);
      throw err;
    }
  }

  public async delete(field: string, value: string | number): Promise<void> {
    try {
      const deleteQuery = { delete: { query: `${field}:"${value}"` } };
      await this.axios.post('/update', deleteQuery);
      if (this.autoCommit) {
        await this.commit();
      }
    } catch (err) {
      console.error('Failed to delete document from Solr:', err);
      throw err;
    }
  }

  public async commit() {
    try {
      await this.axios.post('/update', { commit: {} });
    } catch (err) {
      console.error('Failed to commit changes to Solr:', err);
      throw err;
    }
  }
}
// Create a minimal SolrClient class if not already available
class Solr {
  static createClient(options: SolrOptions) {
    return new SolrClient(options);
  }
}

export namespace Services {
  type SolrFacetFields = Record<string, Array<string | number>>;
  type SolrResponse = {
    response: { numFound: number; docs: Array<Record<string, unknown>> };
    facet_counts?: { facet_fields: SolrFacetFields };
  };
  type SearchField = { name: string; value?: string | number | null };
  type QueueJob<T = unknown> = { attrs: { data: T } };
  type PreIndexMoveConfig = { source: string; dest?: string };
  type PreIndexCopyConfig = { source: string; dest: string };
  type PreIndexJsonStringConfig = { source: string; dest?: string };
  type PreIndexTemplateConfig = { source?: string; dest?: string; template: string };
  type PreIndexFlattenSpecialConfig = { field: string; source: string; dest?: string; options?: Record<string, unknown> };
  type SolrSchema = {
    fields?: SolrFieldDefinition[];
    fieldTypes?: Array<{ name: string; class: string }>;
    dynamicFields?: SolrFieldDefinition[];
    copyFields?: SolrCopyFieldDefinition[];
  };
  type SolrSchemaResponse = { schema: SolrSchema };

  /**
   * Service class for adding documents to Solr.
   *
   */
  export class SolrSearchService extends services.Core.Service implements SearchService {
    protected override _exportedMethods: string[] = [
      'index',
      'remove',
      'searchFuzzy',
      'solrAddOrUpdate',
      'solrDelete',
      'searchAdvanced',
      'preIndex',
      'init'
    ]

    protected queueService!: QueueService;
    private clients: {
      [key: string]: SolrClient;
    } = {};
    private exactAclSchemaReady = new Set<string>();

    private initialization?: Promise<void>;

    constructor() {
      super();
      this.logHeader = "SolrIndexer::";
    }

    public override async init() {
      // preLiftSetup awaits init; bootstrap record saves run before Sails ready.
      const configuredSearch = sails.config.search?.serviceName?.toLowerCase();
      if (!configuredSearch || configuredSearch === 'solrsearchservice') {
        await this.ensureInitialized();
      }
      this.registerSailsHook('on', 'ready', () => {
        this.queueService = sails.services[sails.config.queue.serviceName] as unknown as QueueService;
      });
    }

    private ensureInitialized(): Promise<void> {
      // Inline bootstrap writes and queued workers share the same schema gate.
      if (!this.initialization) {
        this.initialization = (async () => {
          this.initClient();
          await this.buildSchema();
        })().catch(err => {
          this.initialization = undefined;
          throw err;
        });
      }
      return this.initialization;
    }

    private async requireIndexSchema(coreId: string): Promise<void> {
      await this.ensureInitialized();
      if (!this.exactAclSchemaReady.has(coreId)) {
        throw new Error('Exact authorization search schema is not ready.');
      }
    }

    protected override async processDynamicImports() {
      flat = await import("flat");
    }

    protected initClient(ref: SolrSearchService = this) {
      const solrConfig: SolrConfig = sails.config.solr;
      const coreIds: string[] = Object.keys(solrConfig.cores);
      for (const coreId of coreIds) {
        const solrOpts: SolrOptions = solrConfig.cores[coreId].options;
        const client: SolrClient = Solr.createClient(solrOpts);
        ref.clients[coreId] = client;
      }
    }

    protected async buildSchema(ref: SolrSearchService = this) {
      const solrConfig: SolrConfig = sails.config.solr;
      const coreNameKeys: string[] = Object.keys(solrConfig.cores);

      for (const coreId of coreNameKeys) {
        const core: SolrCore = solrConfig.cores[coreId];
        const coreName = core.options.core;
        ref.exactAclSchemaReady.delete(coreId);
        await ref.waitForSolr(coreId, ref);

        try {
          let liveSchema = await ref.getSchema(coreId, ref);
          const schemaDef = ref.getMissingSchemaDefinitions(coreId, core, liveSchema.schema, ref);
          if (ref.isSchemaDefinitionEmpty(schemaDef)) {
            sails.log.verbose(`${ref.logHeader} Schema already reconciled for core: ${coreName}.`);
          } else {
            const schemaUrl = `${ref.getBaseUrl(core.options)}${coreName}/schema`;
            sails.log.verbose(`${ref.logHeader} Sending missing schema definitions for core: ${coreName}.`);
            const response = await axios.post(schemaUrl, schemaDef, solrSetupRequestOptions()).then((response: { data: unknown }) => response.data);
            sails.log.verbose(`${ref.logHeader} Schema reconciliation successful, response: `);
            sails.log.verbose(JSON.stringify(response));
            // An accepted schema update is not proof of the live field types.
            liveSchema = await ref.getSchema(coreId, ref);
          }
          ref.assertExactAclSchema(liveSchema.schema);
          ref.exactAclSchemaReady.add(coreId);
          sails.log.verbose(`${ref.logHeader} Exact authorization search schema verified for core: ${coreName}.`);
        } catch (err) {
          sails.log.error(`${ref.logHeader} Failed to reconcile SOLR schema for core: ${coreName}.`);
          sails.log.error(err instanceof Error ? err.message : JSON.stringify(err));
          throw err;
        }
      }
    }

    private isSchemaDefinitionEmpty(schemaDef: SolrCoreSchema): boolean {
      return schemaDef['add-field'].length === 0 &&
        schemaDef['add-dynamic-field'].length === 0 &&
        schemaDef['add-copy-field'].length === 0;
    }

    private getMissingSchemaDefinitions(coreId: string, core: SolrCore, liveSchema: SolrSchema, ref: SolrSearchService = this): SolrCoreSchema {
      const configuredFields = [...(core.schema['add-field'] || [])];
      for (const field of SOLR_EXACT_ACL_FIELDS) {
        if (!configuredFields.some(configured => configured.name === field.name)) {
          configuredFields.push({ ...field });
        }
      }
      if (core.initSchemaFlag && !configuredFields.some(field => field.name === core.initSchemaFlag?.name)) {
        configuredFields.push({ ...core.initSchemaFlag });
      }

      return {
        'add-field': ref.getMissingFieldDefinitions(coreId, configuredFields, liveSchema.fields || [], ref),
        'add-dynamic-field': ref.getMissingFieldDefinitions(coreId, core.schema['add-dynamic-field'] || [], liveSchema.dynamicFields || [], ref),
        'add-copy-field': (core.schema['add-copy-field'] || []).filter(copyField =>
          !(liveSchema.copyFields || []).some(liveCopyField =>
            liveCopyField.source === copyField.source && liveCopyField.dest === copyField.dest))
      };
    }

    private getMissingFieldDefinitions(coreId: string, configured: SolrFieldDefinition[], live: SolrFieldDefinition[], ref: SolrSearchService): SolrFieldDefinition[] {
      return configured.filter(desired => {
        const existing = live.find(field => field.name === desired.name);
        if (!existing) {
          return true;
        }
        if (!ref.schemaFieldsMatch(desired, existing)) {
          sails.log.error(JSON.stringify({
            message: 'Solr schema definition conflict; existing field will not be replaced.',
            core: coreId,
            fieldName: desired.name,
            desiredDefinition: desired,
            liveDefinition: existing
          }));
        }
        return false;
      });
    }

    private schemaFieldsMatch(desired: SolrFieldDefinition, live: SolrFieldDefinition): boolean {
      const properties: Array<keyof SolrFieldDefinition> = ['name', 'type', 'indexed', 'stored', 'multiValued', 'required', 'docValues'];
      return properties.every(property => {
        if (desired[property] === undefined) {
          return true;
        }
        const liveValue = live[property] === undefined && typeof desired[property] === 'boolean'
          ? false
          : live[property];
        return desired[property] === liveValue;
      });
    }

    private assertExactAclSchema(schema: SolrSchema): void {
      const stringType = schema.fieldTypes?.find(type => type.name === 'string');
      if (!stringType || !['solr.StrField', 'org.apache.solr.schema.StrField'].includes(stringType.class)) {
        throw new Error('Exact authorization search requires a non-analyzed string field type.');
      }
      for (const required of SOLR_EXACT_ACL_FIELDS) {
        const live = schema.fields?.find(field => field.name === required.name);
        if (!live || !this.schemaFieldsMatch(required, live)) {
          throw new Error(`Exact authorization search schema is missing or conflicts: ${required.name}.`);
        }
        // Solr copyFields run after preIndex and must not add untrusted grants.
        const hasIncomingCopy = schema.copyFields?.some(copy => {
          const wildcard = copy.dest.indexOf('*');
          return wildcard < 0 ? copy.dest === required.name :
            required.name.startsWith(copy.dest.slice(0, wildcard)) &&
            required.name.endsWith(copy.dest.slice(wildcard + 1));
        });
        if (hasIncomingCopy) {
          throw new Error(`Exact authorization search field cannot be a copyField destination: ${required.name}.`);
        }
      }
    }

    private async getSchema(coreId: string, ref: SolrSearchService = this): Promise<SolrSchemaResponse> {
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      const schemaUrl = `${ref.getBaseUrl(core.options)}${core.options.core}/schema?wt=json&showDefaults=true`;
      return await axios.get(schemaUrl, solrSetupRequestOptions()).then((response: { data: SolrSchemaResponse }) => response.data);
    }

    private async waitForSolr(coreId: string, ref: SolrSearchService = this) {
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      const coreName: string = core.options.core;
      const urlCheck = `${ref.getBaseUrl(core.options)}admin/cores?action=STATUS&core=${coreName}`;
      const configuredAttempts = Number(solrConfig.maxWaitTries);
      const maxAttempts = Number.isFinite(configuredAttempts) ? Math.max(1, Math.floor(configuredAttempts)) : 1;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          sails.log.verbose(`${ref.logHeader} Checking if SOLR is up, try #${attempt}... ${urlCheck}`);
          const solrStat = await axios.get(urlCheck, solrSetupRequestOptions()).then((response: { data: { status: Record<string, { instanceDir?: string }> } }) => response.data);
          if (solrStat.status[coreName]?.instanceDir) {
            sails.log.info(`${ref.logHeader} SOLR core is available: ${coreName}`);
            return;
          }
        } catch (err) {
          sails.log.info(`${ref.logHeader} SOLR core: ${coreName} is still down, waiting.`);
          sails.log.info(JSON.stringify(err));
        }
        if (attempt < maxAttempts) {
          await ref.sleep(solrConfig.waitTime);
        }
      }
      throw new Error(`SOLR core: ${coreName} unavailable after ${maxAttempts} attempts.`);
    }

    private getBaseUrl(coreOptions: SolrOptions): string {
      return `${coreOptions.https ? 'https' : 'http'}://${coreOptions.host}:${coreOptions.port}/solr/`;
    }

    public async index(id: string, data: RecordModel): Promise<boolean> {
      this.updateChronicle({ solrRecordId: id, solrOperation: 'index' });
      data.id = id;

      return this.enqueueOrRunNow(
        sails.config.solr.createOrUpdateJobName,
        data,
        async (job) => this.solrAddOrUpdate(job as QueueJob<RecordModel>)
      );
    }

    public remove(id: string): void {
      this.updateChronicle({ solrRecordId: id, solrOperation: 'delete' });
      const data = { id: id };

      void this.enqueueOrRunNow(
        sails.config.solr.deleteJobName,
        data,
        async (job) => this.solrDelete(job as QueueJob<RecordModel>)
      );
    }

    private async enqueueOrRunNow<T>(
      jobName: string,
      data: T,
      fallback: (job: QueueJob<T>) => Promise<void>
    ): Promise<boolean> {
      const usesQueue = this.queueService && typeof this.queueService.now === 'function';
      try {
        if (usesQueue) {
          await this.queueService.now(jobName, data);
          return true;
        }

        this.updateChronicle({ solrJob: jobName, solrJobExecution: 'inline' }, [], 'warn');
        await fallback({ attrs: { data } });
        return true;
      } catch (err) {
        if (usesQueue) {
          this.updateChronicle({ solrJob: jobName, solrJobOutcome: 'submission-failed' }, [err]);
        }
        return false;
      }
    }

    public async searchAdvanced(coreId: string = 'default', type: string, query: string | URLSearchParams): Promise<Record<string, unknown>> {
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      const coreName = core.options.core;
      const url = `${this.getBaseUrl(core.options)}${coreName}/select`;
      const params = query instanceof URLSearchParams ? query : this.parseQueryFragment(query);
      this.updateChronicle({ solrCore: coreId, solrSearchMode: 'advanced' });
      const response = await axios.get(url, { params }).then((response: { data: Record<string, unknown> }) => response.data);
      return response;
    }

    public async searchFuzzy(coreId: string = 'default', type: string, workflowState: string, searchQuery: string, exactSearches: SearchField[], facetSearches: SearchField[], brand: BrandingModel, user: UserModel, roles: RoleModel[], returnFields: string[], start: number = 0, rows: number = 10): Promise<Record<string, unknown>> {
      if (!this.exactAclSchemaReady.has(coreId)) {
        throw new Error('Exact authorization search schema is not ready.');
      }
      const username = user?.username ?? '';
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      const coreName = core.options.core;
      const baseUrl = `${this.getBaseUrl(core.options)}${coreName}/select`;

      const allParams: Array<{ key: string; value: string }> = [];
      const qParts = [`metaMetadata_brandId:${brand.id}`, `metaMetadata_type:${type}`];
      if (workflowState) {
        qParts.push(`workflow_stage:${workflowState}`);
      }
      qParts.push(`full_text:${searchQuery}`);
      allParams.push({ key: 'q', value: qParts.join(' AND ') });

      _.forEach(exactSearches, (exactSearch: SearchField) => {
        allParams.push({ key: 'fq', value: `${exactSearch.name}:${this.luceneEscape(exactSearch.value)}` });
      });
      if (facetSearches.length > 0) {
        allParams.push({ key: 'facet', value: 'true' });
        _.forEach(facetSearches, (facetSearch: SearchField) => {
          allParams.push({ key: 'facet.field', value: facetSearch.name });
          if (!_.isEmpty(facetSearch.value)) {
            allParams.push({ key: 'fq', value: `${facetSearch.name}:${this.luceneEscape(facetSearch.value)}` });
          }
        });
      }
      allParams.push({ key: 'start', value: String(start) });
      allParams.push({ key: 'rows', value: String(rows) });
      allParams.push({ key: 'version', value: '2.2' });
      allParams.push({ key: 'wt', value: 'json' });
      allParams.push({ key: 'sort', value: 'date_object_modified desc' });

      this.addAuthParams(allParams, username, roles, brand, false);

      const params = new URLSearchParams();
      for (const param of allParams) {
        params.append(param.key, param.value);
      }

      this.updateChronicle({
        solrCore: coreId,
        solrSearchMode: 'fuzzy',
        solrRecordType: type,
        solrStart: start,
        solrRows: rows,
      });
      const response = await axios.get(baseUrl, { params }).then((response: { data: SolrResponse }) => response.data);
      const customResp: { records: Array<Record<string, unknown>>; facets?: Array<{ name: string; values: Array<{ value: string; count: number }> }>; totalItems?: number } = {
        records: []
      };
      const totalItems = response.response.numFound;

      _.forEach(response.response.docs, (solrdoc: Record<string, unknown>) => {
        const customDoc: Record<string, unknown> = {};
        _.forEach(returnFields, (retField: string) => {
          const fieldValue = solrdoc[retField];
          if (Array.isArray(fieldValue)) {
            customDoc[retField] = fieldValue[0];
          } else {
            customDoc[retField] = fieldValue;
          }
        });
        customDoc["hasEditAccess"] = RecordsService.hasEditAccess(brand, user, roles as unknown as Array<Record<string, unknown>>, solrdoc);
        customResp.records.push(customDoc);
      });
      // check if have facets turned on...
      const facetFields = response.facet_counts?.facet_fields;
      if (facetFields) {
        const facets: Array<{ name: string; values: Array<{ value: string; count: number }> }> = [];
        customResp['facets'] = facets;
        _.forOwn(facetFields, (facet_field: Array<string | number>, facet_name: string) => {
          const numFacetsValues = _.size(facet_field) / 2;
          const facetValues: Array<{ value: string; count: number }> = [];
          for (let i = 0, j = 0; i < numFacetsValues; i++) {
            facetValues.push({
              value: String(facet_field[j++]),
              count: Number(facet_field[j++])
            });
          }
          facets.push({
            name: facet_name,
            values: facetValues
          });
        });
      }
      this.updateChronicle({ solrTotalItems: totalItems, solrResultCount: customResp.records.length });
      customResp['totalItems'] = totalItems;
      return customResp;
    }

    private clientSleep() {
      if (!_.isUndefined(sails.config.solr.clientSleepTimeMillis)) {
        this.updateChronicle({ solrClientSleepMs: sails.config.solr.clientSleepTimeMillis });
        return this.sleep(sails.config.solr.clientSleepTimeMillis);
      } else {
        return Promise.resolve();
      }
    }

    public async solrAddOrUpdate(job: QueueJob<RecordModel>) {
      try {
        await this.ensureInitialized();
        const data: RecordModel = job.attrs.data as RecordModel;
        const coreId = String(_.get(data, 'metaMetadata.searchCore', 'default'));
        if (!this.clients[coreId]) {
          throw new Error(`Unknown SOLR core: ${coreId}`);
        }
        await this.requireIndexSchema(coreId);
        // storage_id is used as the main ID in searches
        const solrDocument: SolrDocument = new SolrDocument(data);
        this.updateChronicle({ solrRecordId: solrDocument.id, solrOperation: 'index' });
        // flatten the JSON
        const processedData = this.preIndex(solrDocument);
        this.updateChronicle({ solrIndexFieldCount: Object.keys(processedData).length });
        await this.clients[coreId].add(processedData);
        // intentionally adding the commit call as the client doesn't respect the 'autoCommit' flag
        await this.clients[coreId].commit();
        await this.clientSleep();
      } catch (err) {
        this.updateChronicle({ solrIndexOutcome: 'failed' }, [err]);
        throw err;
      }
    }

    // TODO: This method shouldn't need to be public
    // but can't unit test it easily if it isn't
    public preIndex(data: SolrDocument): Record<string, unknown> {
      // Snapshot trusted values before templates/moves/copies can touch them.
      const exactAuthorization = {
        redbox_acl2_view: exactAclValues(data.authorization?.view),
        redbox_acl2_edit: exactAclValues(data.authorization?.edit),
        redbox_acl2_view_roles: exactAclValues(data.authorization?.viewRoles),
        redbox_acl2_edit_roles: exactAclValues(data.authorization?.editRoles),
        redbox_acl2_version: SOLR_EXACT_ACL_VERSION
      };
      const exactBrand = typeof data.metaMetadata?.brandId === 'string' ? data.metaMetadata.brandId : undefined;
      let processedData: Record<string, unknown> = _.cloneDeep(data) as unknown as Record<string, unknown>;

      const coreId = _.get(data, 'metaMetadata.searchCore', 'default');
      const moveObj = _.get(sails.config.solr.cores, coreId + '.preIndex.move') as unknown as PreIndexMoveConfig[];
      // moving
      _.each(moveObj, (moveConfig: PreIndexMoveConfig) => {
        const source: string = moveConfig.source;
        const dest: string = moveConfig.dest ?? '';
        // the data used will always be the original object
        const moveData: unknown = _.get(data, source);
        if (!_.isEmpty(moveData)) {
          _.unset(processedData, source);
          if (_.isEmpty(dest)) {
            // empty destination means the root object
            _.merge(processedData, moveData);
          } else {
            _.set(processedData, dest, moveData);
          }
        }
      });
      const copyObj = _.get(sails.config.solr.cores, coreId + '.preIndex.copy') as unknown as PreIndexCopyConfig[];
      // copying
      _.each(copyObj, (copyConfig: PreIndexCopyConfig) => {
        _.set(processedData, copyConfig.dest, _.get(data, copyConfig.source));
      });
      const jsonStringObj = _.get(sails.config.solr.cores, coreId + '.preIndex.jsonString') as unknown as PreIndexJsonStringConfig[];
      _.each(jsonStringObj, (jsonStringConfig: PreIndexJsonStringConfig) => {
        let setProperty: string = jsonStringConfig.source;
        if (jsonStringConfig.dest != null) {
          setProperty = jsonStringConfig.dest;
        }
        _.set(processedData, setProperty, JSON.stringify(_.get(data, jsonStringConfig.source, undefined)));
      });
      const templateObj = _.get(sails.config.solr.cores, coreId + '.preIndex.template') as unknown as PreIndexTemplateConfig[];
      //Evaluate a template to generate a value for the solr document
      _.each(templateObj, (templateConfig: PreIndexTemplateConfig) => {
        let setProperty: string = templateConfig.source ?? '';
        if (templateConfig.dest != null) {
          setProperty = templateConfig.dest;
        }

        // If no source property set, use the whole data object
        let templateData: unknown;
        if (templateConfig.source != null) {
          templateData = _.get(data, templateConfig.source)
        } else {
          templateData = _.cloneDeep(data);
        }

        const template = _.template(templateConfig.template)
        _.set(processedData, setProperty, template({ data: templateData }));
      });

      const flattenSpecialObj = _.get(sails.config.solr.cores, coreId + '.preIndex.flatten.special') as unknown as PreIndexFlattenSpecialConfig[];
      // flattening...
      // first remove those with special flattening options
      _.each(flattenSpecialObj, (specialFlattenConfig: PreIndexFlattenSpecialConfig) => {
        _.unset(processedData, specialFlattenConfig.field);
      });
      const flattenOptionsObj = _.get(sails.config.solr.cores, coreId + '.preIndex.flatten.options') as unknown as Record<string, unknown> | undefined;
      const flatModule = flat;
      if (!flatModule) {
        throw new Error('flat module not loaded');
      }
      processedData = flatModule.flatten(processedData, flattenOptionsObj);
      _.each(flattenSpecialObj, (specialFlattenConfig: PreIndexFlattenSpecialConfig) => {
        const dataToFlatten: Record<string, unknown> = {};
        if (specialFlattenConfig.dest) {
          _.set(dataToFlatten, specialFlattenConfig.dest, _.get(data, specialFlattenConfig.source));
        } else {
          _.set(dataToFlatten, specialFlattenConfig.source, _.get(data, specialFlattenConfig.source));
        }
        const flattened = flatModule.flatten(dataToFlatten, specialFlattenConfig.options);
        _.merge(processedData, flattened);
      });

      // Solr pdate fields require UTC ISO values with a Z suffix.
      _.forOwn(processedData, (value: unknown, fieldName: string) => {
        if (fieldName.startsWith('date_')) {
          processedData[fieldName] = normalizeSolrDateValue(value);
        }
      });

      // sanitise any empty keys so SOLR doesn't complain
      _.forOwn(processedData, (_v: unknown, k: string) => {
        if (_.isEmpty(k)) {
          _.unset(processedData, k);
        }
      });
      // Reserved fields always come from the original record envelope, after
      // every configurable transform, including flattening and templates.
      for (const field of SOLR_EXACT_ACL_FIELDS) delete processedData[field.name];
      for (const name of RETIRED_EXACT_ACL_FIELD_NAMES) delete processedData[name];
      Object.assign(processedData, exactAuthorization);
      if (exactBrand) processedData.redbox_acl2_brand = exactBrand;
      return processedData;
    }

    protected luceneEscape(str: string | number | null | undefined) {
      return luceneEscapeQuery(String(str ?? ''));
    }

    protected addAuthParams(allParams: Array<{ key: string; value: string }> | URLSearchParams, username: string, roles: RoleModel[], brand: BrandingModel, editAccessOnly: boolean | undefined = undefined) {
      const params = allParams instanceof URLSearchParams ? allParams :
        new URLSearchParams(allParams.map(param => [param.key, param.value]));
      // Parameter references must resolve only to server-supplied identities,
      // including when the URL already contains duplicate/reserved parameters.
      for (const name of [...params.keys()]) {
        if (name.startsWith('rbAcl')) params.delete(name);
      }
      const clauses: string[] = [];
      if (typeof username === 'string' && username.length > 0) {
        params.set('rbAclUser', username);
        clauses.push('_query_:"{!term f=redbox_acl2_edit v=$rbAclUser}"');
        if (!editAccessOnly) clauses.push('_query_:"{!term f=redbox_acl2_view v=$rbAclUser}"');
      }
      const roleNames = new Set<string>();
      for (const role of roles ?? []) {
        const roleBrand = role.branding as BrandingModel | string | undefined;
        const roleBrandId = typeof roleBrand === 'object' ? roleBrand?.id : roleBrand;
        if (roleBrandId === brand?.id && typeof role.name === 'string' && role.name.length > 0) roleNames.add(role.name);
      }
      [...roleNames].forEach((name, index) => {
        const parameter = `rbAclRole${index}`;
        params.set(parameter, name);
        clauses.push(`_query_:"{!term f=redbox_acl2_edit_roles v=$${parameter}}"`);
        if (!editAccessOnly) clauses.push(`_query_:"{!term f=redbox_acl2_view_roles v=$${parameter}}"`);
      });
      params.set('rbAclVersion', SOLR_EXACT_ACL_VERSION);
      params.append('fq', '{!term f=redbox_acl2_version v=$rbAclVersion}');
      if (typeof brand?.id === 'string' && brand.id.length > 0 && clauses.length > 0) {
        params.set('rbAclBrand', brand.id);
        params.append('fq', '{!term f=redbox_acl2_brand v=$rbAclBrand}');
        params.append('fq', `{!lucene}(${clauses.join(' OR ')})`);
      } else {
        params.append('fq', '{!lucene}(*:* AND -(*:*))');
      }
      if (!(allParams instanceof URLSearchParams)) {
        allParams.splice(0, allParams.length, ...[...params].map(([key, value]) => ({ key, value })));
      }
    }

    protected parseQueryFragment(query: string): URLSearchParams {
      const params = new URLSearchParams();
      for (const [index, part] of query.split('&').entries()) {
        const separator = part.indexOf('=');
        if (separator < 0) {
          if (index === 0 && part) params.set('q', part);
          continue;
        }
        params.append(part.slice(0, separator), part.slice(separator + 1));
      }
      return params;
    }

    protected addAuthFilter(url: string, username: string, roles: RoleModel[], brand: BrandingModel, editAccessOnly: boolean | undefined = undefined) {
      const parsed = new URL(url);
      this.addAuthParams(parsed.searchParams, username, roles, brand, editAccessOnly);
      return parsed.toString();
    }

    public async solrDelete(job: QueueJob<RecordModel>) {
      try {
        await this.ensureInitialized();
        const data = job.attrs.data;
        const coreId = String(_.get(data, 'searchCore', 'default'));
        if (!this.clients[coreId]) {
          throw new Error(`Unknown SOLR core: ${coreId}`);
        }
        await this.requireIndexSchema(coreId);
        const solrDocument: SolrDocument = new SolrDocument(data);
        this.updateChronicle({ solrRecordId: solrDocument.id, solrOperation: 'delete' });
        await this.clients[coreId].delete('id', solrDocument.id);
        // intentionally adding the commit call as the client doesn't respect the 'autoCommit' flag
        await this.clients[coreId].commit();
        await this.clientSleep();
      } catch (err) {
        this.updateChronicle({ solrDeleteOutcome: 'failed' }, [err]);
        throw err;
      }
    }
  }
}

declare global {
  let SolrSearchService: Services.SolrSearchService;
}
