import { SolrReads } from '../queries/SolrReads';
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
import type {
  SolrSearchConfig,
  SolrCoreConfig,
  SolrCoreOptions,
  SolrCoreSchema,
  SolrFieldDefinition,
  SolrCopyFieldDefinition,
} from '../config/solr.config';
import { RecordModel } from '../model/storage/RecordModel';
import { SolrDocument } from '../model/SolrDocument';
import { Services as services } from '../CoreService';
import { RecordsService } from '../RecordsService';
import { DateTime } from 'luxon';

type SolrOptions = SolrCoreOptions;
type SolrCore = SolrCoreConfig;
type SolrConfig = SolrSearchConfig;

const axios = require('axios');
type FlatModule = {
  flatten: (obj: Record<string, unknown>, options?: Record<string, unknown>) => Record<string, unknown>;
};
let flat: FlatModule | null = null;

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
    return date.isValid ? (date.toUTC().toISO() ?? value) : value;
  }
  if (typeof value !== 'string' || !/^(?:[+-]\d{6}|\d{4})-?\d{2}-?\d{2}(?:T|$)/.test(value)) {
    return value;
  }
  const date = DateTime.fromISO(value, { zone: 'utc', setZone: true });
  return date.isValid ? (date.toUTC().toISO() ?? value) : value;
}

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
  type QueueJob<T = unknown> = { attrs: { data: T } };
  type PreIndexMoveConfig = { source: string; dest?: string };
  type PreIndexCopyConfig = { source: string; dest: string };
  type PreIndexJsonStringConfig = { source: string; dest?: string };
  type PreIndexTemplateConfig = { source?: string; dest?: string; template: string };
  type PreIndexFlattenSpecialConfig = {
    field: string;
    source: string;
    dest?: string;
    options?: Record<string, unknown>;
  };
  type SolrSchema = {
    fields?: SolrFieldDefinition[];
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
      'init',
    ];

    protected queueService!: QueueService;
    private clients: {
      [key: string]: SolrClient;
    } = {};

    constructor() {
      super();
      this.logHeader = 'SolrIndexer::';
    }

    public override init() {
      const that = this;
      this.registerSailsHook('on', 'ready', async function () {
        that.queueService = sails.services[sails.config.queue.serviceName] as unknown as QueueService;
        that.initClient();
        await that.buildSchema(that);
      });
    }

    protected override async processDynamicImports() {
      flat = await import('flat');
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
        await ref.waitForSolr(coreId, ref);

        try {
          const liveSchema = await ref.getSchema(coreId, ref);
          const schemaDef = ref.getMissingSchemaDefinitions(coreId, core, liveSchema.schema, ref);
          if (ref.isSchemaDefinitionEmpty(schemaDef)) {
            sails.log.verbose(`${ref.logHeader} Schema already reconciled for core: ${coreName}.`);
            continue;
          }

          const schemaUrl = `${ref.getBaseUrl(core.options)}${coreName}/schema`;
          sails.log.verbose(`${ref.logHeader} Sending missing schema definitions for core: ${coreName}.`);
          const response = await axios.post(schemaUrl, schemaDef).then((response: { data: unknown }) => response.data);
          sails.log.verbose(`${ref.logHeader} Schema reconciliation successful, response: `);
          sails.log.verbose(JSON.stringify(response));
        } catch (err) {
          sails.log.error(`${ref.logHeader} Failed to reconcile SOLR schema for core: ${coreName}.`);
          sails.log.error(JSON.stringify(err));
        }
      }
    }

    private isSchemaDefinitionEmpty(schemaDef: SolrCoreSchema): boolean {
      return (
        schemaDef['add-field'].length === 0 &&
        schemaDef['add-dynamic-field'].length === 0 &&
        schemaDef['add-copy-field'].length === 0
      );
    }

    private getMissingSchemaDefinitions(
      coreId: string,
      core: SolrCore,
      liveSchema: SolrSchema,
      ref: SolrSearchService = this
    ): SolrCoreSchema {
      const configuredFields = [...(core.schema['add-field'] || [])];
      if (core.initSchemaFlag && !configuredFields.some(field => field.name === core.initSchemaFlag?.name)) {
        configuredFields.push({ ...core.initSchemaFlag });
      }

      return {
        'add-field': ref.getMissingFieldDefinitions(coreId, configuredFields, liveSchema.fields || [], ref),
        'add-dynamic-field': ref.getMissingFieldDefinitions(
          coreId,
          core.schema['add-dynamic-field'] || [],
          liveSchema.dynamicFields || [],
          ref
        ),
        'add-copy-field': (core.schema['add-copy-field'] || []).filter(
          copyField =>
            !(liveSchema.copyFields || []).some(
              liveCopyField => liveCopyField.source === copyField.source && liveCopyField.dest === copyField.dest
            )
        ),
      };
    }

    private getMissingFieldDefinitions(
      coreId: string,
      configured: SolrFieldDefinition[],
      live: SolrFieldDefinition[],
      ref: SolrSearchService
    ): SolrFieldDefinition[] {
      return configured.filter(desired => {
        const existing = live.find(field => field.name === desired.name);
        if (!existing) {
          return true;
        }
        if (!ref.schemaFieldsMatch(desired, existing)) {
          sails.log.error(
            JSON.stringify({
              message: 'Solr schema definition conflict; existing field will not be replaced.',
              core: coreId,
              fieldName: desired.name,
              desiredDefinition: desired,
              liveDefinition: existing,
            })
          );
        }
        return false;
      });
    }

    private schemaFieldsMatch(desired: SolrFieldDefinition, live: SolrFieldDefinition): boolean {
      const properties: Array<keyof SolrFieldDefinition> = [
        'name',
        'type',
        'indexed',
        'stored',
        'multiValued',
        'required',
        'docValues',
      ];
      return properties.every(property => {
        if (desired[property] === undefined) {
          return true;
        }
        const liveValue =
          live[property] === undefined && typeof desired[property] === 'boolean' ? false : live[property];
        return desired[property] === liveValue;
      });
    }

    private async getSchema(coreId: string, ref: SolrSearchService = this): Promise<SolrSchemaResponse> {
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      const schemaUrl = `${ref.getBaseUrl(core.options)}${core.options.core}/schema?wt=json`;
      return await axios.get(schemaUrl).then((response: { data: SolrSchemaResponse }) => response.data);
    }

    private async waitForSolr(coreId: string, ref: SolrSearchService = this) {
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      const coreName: string = core.options.core;
      let solrUp = false;
      let tryCtr = 0;
      const urlCheck = `${ref.getBaseUrl(core.options)}admin/cores?action=STATUS&core=${coreName}`;
      while (!solrUp && tryCtr <= sails.config.solr.maxWaitTries) {
        try {
          tryCtr++;
          sails.log.verbose(`${ref.logHeader} Checking if SOLR is up, try #${tryCtr}... ${urlCheck}`);
          const solrStat = await axios
            .get(urlCheck)
            .then((response: { data: { status: Record<string, { instanceDir?: string }> } }) => response.data);
          sails.log.verbose(`${ref.logHeader} Response is:`);
          sails.log.verbose(JSON.stringify(solrStat));
          if (solrStat.status[coreName].instanceDir) {
            sails.log.info(`${ref.logHeader} SOLR core is available: ${coreName}`);
            solrUp = true;
          } else {
            throw new Error(`SOLR core: ${coreName} is still loading.`);
          }
        } catch (err) {
          sails.log.info(`${ref.logHeader} SOLR core: ${coreName} is still down, waiting.`);
          sails.log.info(JSON.stringify(err));
          if (tryCtr == sails.config.solr.maxWaitTries) {
            sails.log.error(`${ref.logHeader} SOLR seemed to have failed startup, giving up on waiting.`);
            break;
          }
          await ref.sleep(sails.config.solr.waitTime);
        }
      }
    }

    private getBaseUrl(coreOptions: SolrOptions): string {
      return `${coreOptions.https ? 'https' : 'http'}://${coreOptions.host}:${coreOptions.port}/solr/`;
    }

    public async index(id: string, data: RecordModel): Promise<boolean> {
      this.updateChronicle({ solrRecordId: id, solrOperation: 'index' });
      data.id = id;

      return this.enqueueOrRunNow(sails.config.solr.createOrUpdateJobName, data, async job =>
        this.solrAddOrUpdate(job as QueueJob<RecordModel>)
      );
    }

    public remove(id: string): void {
      this.updateChronicle({ solrRecordId: id, solrOperation: 'delete' });
      const data = { id: id };

      void this.enqueueOrRunNow(sails.config.solr.deleteJobName, data, async job =>
        this.solrDelete(job as QueueJob<RecordModel>, undefined)
      );
    }

    private async enqueueOrRunNow<T>(
      jobName: string,
      data: T,
      fallback: (job: QueueJob<T>) => Promise<void>
    ): Promise<boolean> {
      try {
        if (this.queueService && typeof this.queueService.now === 'function') {
          await this.queueService.now(jobName, data);
          return true;
        }

        this.updateChronicle({ solrJob: jobName, solrJobExecution: 'inline' }, [], 'warn');
        await fallback({ attrs: { data } });
        return true;
      } catch (err) {
        this.updateChronicle({ solrJob: jobName, solrJobOutcome: 'submission-failed' }, [err]);
        return false;
      }
    }

    private reads(): SolrReads {
      return new SolrReads({
        config: sails.config.solr,
        log: this.logger,
        hasEditAccess: (...args) => RecordsService.hasEditAccess(...args),
      });
    }
    public searchAdvanced(...args: Parameters<SolrReads['searchAdvanced']>) {
      return this.reads().searchAdvanced(...args);
    }
    public searchFuzzy(...args: Parameters<SolrReads['searchFuzzy']>) {
      return this.reads().searchFuzzy(...args);
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
        const data: RecordModel = job.attrs.data as RecordModel;
        const coreId = String(_.get(data, 'metaMetadata.searchCore', 'default'));
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
      }
    }

    // TODO: This method shouldn't need to be public
    // but can't unit test it easily if it isn't
    public preIndex(data: SolrDocument): Record<string, unknown> {
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
      const jsonStringObj = _.get(
        sails.config.solr.cores,
        coreId + '.preIndex.jsonString'
      ) as unknown as PreIndexJsonStringConfig[];
      _.each(jsonStringObj, (jsonStringConfig: PreIndexJsonStringConfig) => {
        let setProperty: string = jsonStringConfig.source;
        if (jsonStringConfig.dest != null) {
          setProperty = jsonStringConfig.dest;
        }
        _.set(processedData, setProperty, JSON.stringify(_.get(data, jsonStringConfig.source, undefined)));
      });
      const templateObj = _.get(
        sails.config.solr.cores,
        coreId + '.preIndex.template'
      ) as unknown as PreIndexTemplateConfig[];
      //Evaluate a template to generate a value for the solr document
      _.each(templateObj, (templateConfig: PreIndexTemplateConfig) => {
        let setProperty: string = templateConfig.source ?? '';
        if (templateConfig.dest != null) {
          setProperty = templateConfig.dest;
        }

        // If no source property set, use the whole data object
        let templateData: unknown;
        if (templateConfig.source != null) {
          templateData = _.get(data, templateConfig.source);
        } else {
          templateData = _.cloneDeep(data);
        }

        const template = _.template(templateConfig.template);
        _.set(processedData, setProperty, template({ data: templateData }));
      });

      const flattenSpecialObj = _.get(
        sails.config.solr.cores,
        coreId + '.preIndex.flatten.special'
      ) as unknown as PreIndexFlattenSpecialConfig[];
      // flattening...
      // first remove those with special flattening options
      _.each(flattenSpecialObj, (specialFlattenConfig: PreIndexFlattenSpecialConfig) => {
        _.unset(processedData, specialFlattenConfig.field);
      });
      const flattenOptionsObj = _.get(sails.config.solr.cores, coreId + '.preIndex.flatten.options') as unknown as
        | Record<string, unknown>
        | undefined;
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
      return processedData;
    }

    protected luceneEscape(...args: Parameters<SolrReads['luceneEscape']>) {
      return this.reads().luceneEscape(...args);
    }
    protected addAuthParams(...args: Parameters<SolrReads['addAuthParams']>) {
      return this.reads().addAuthParams(...args);
    }
    protected parseQueryFragment(...args: Parameters<SolrReads['parseQueryFragment']>) {
      return this.reads().parseQueryFragment(...args);
    }
    protected addAuthFilter(...args: Parameters<SolrReads['addAuthFilter']>) {
      return this.reads().addAuthFilter(...args);
    }
    public async solrDelete(job: QueueJob<RecordModel>, _done: unknown) {
      try {
        const data = job.attrs.data;
        const coreId = String(_.get(data, 'searchCore', 'default'));
        const solrDocument: SolrDocument = new SolrDocument(data);
        this.updateChronicle({ solrRecordId: solrDocument.id, solrOperation: 'delete' });
        await this.clients[coreId].delete('id', solrDocument.id);
        // intentionally adding the commit call as the client doesn't respect the 'autoCommit' flag
        await this.clients[coreId].commit();
        await this.clientSleep();
      } catch (err) {
        this.updateChronicle({ solrDeleteOutcome: 'failed' }, [err]);
      }
    }
  }
}

declare global {
  let SolrSearchService: Services.SolrSearchService;
}
