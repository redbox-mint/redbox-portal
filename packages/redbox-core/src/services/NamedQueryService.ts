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

import { Services as services } from '../CoreService';
import { normalizeRelatedReferences } from '../related-records/references';
import { buildNamedQueryUsage, NamedQueryInUseError, NamedQueryUsage } from './named-query/usage';
import type { NamedQueryDefinition, NamedQueryParam, DatabaseNamedQueryDefinition } from '../config/namedQuery.config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DateTime } from 'luxon';
import { ListAPIResponse } from '../model/ListAPIResponse';
import { firstValueFrom } from 'rxjs';
import { BrandingModel } from '../model/storage/BrandingModel';
import { RecordModel } from '../model/storage/RecordModel';
import type { RecordsService } from '../RecordsService';
import { UserAttributes } from '../waterline-models/User';
import { NamedQueryAttributes } from '../waterline-models/NamedQuery';
import { NamedQueryExecutionBudget, NAMED_QUERY_PREVIEW_LIMITS, NamedQueryAssistanceError, previewDeadlineIssue } from '../utilities/NamedQueryPreview';
import {handlebarsCompile} from "@researchdatabox/sails-ng-common";
import type { GraphqlNamedQueryOperation, InvalidNamedQueryCatalogueEntry } from '@researchdatabox/sails-ng-common';
import { assertNamedQueryDefinition, NamedQueryDefinitionError, namedQuerySource, requireDatabaseNamedQuery } from './named-query/definition';
import type { GraphQLSchema } from 'graphql';
import type { ReadCaller } from '../record-graphql/read-record';
import { inspectGraphqlNamedQuery, validateGraphqlNamedQuery, graphqlDiagnostic, GraphqlNamedQueryValidationError } from './named-query/graphql-validation';
import { NamedQueryPreviewOutputLimitError, renderNamedQueryPreviewTemplate } from '../utilities/NamedQueryPreviewTemplate';

export type NamedQueryResponseMetadata = Record<string, unknown> | string | number | boolean | null;

type AnyRecord = Record<string, unknown>;
type BrandScope =
  | { type: 'field'; fieldPath: string }
  | { type: 'userRoles'; fieldPath: '' };
type NativeRecordCollection = {
  countDocuments: (criteria: Record<string, unknown>, options?: { maxTimeMS: number }) => Promise<number>;
  find: (criteria: Record<string, unknown>, options?: { maxTimeMS: number }) => {
    sort: (sort: Record<string, 1 | -1>) => NativeRecordCursor;
    skip: (skip: number) => NativeRecordCursor;
    limit: (limit: number) => NativeRecordCursor;
    toArray: () => Promise<Record<string, unknown>[]>;
  };
};
type NativeRecordCursor = {
  sort: (sort: Record<string, 1 | -1>) => NativeRecordCursor;
  skip: (skip: number) => NativeRecordCursor;
  limit: (limit: number) => NativeRecordCursor;
  toArray: () => Promise<Record<string, unknown>[]>;
};

const isRecordValue = (value: unknown): value is AnyRecord => typeof value === 'object' && value !== null;

const getStringProperty = (value: unknown, propertyName: string): string | undefined => {
  if (!isRecordValue(value)) {
    return undefined;
  }

  const propertyValue = value[propertyName];
  return typeof propertyValue === 'string' ? propertyValue : undefined;
};

const getIdentifierProperty = (value: unknown, propertyName: string): string | undefined => {
  if (!isRecordValue(value)) {
    return undefined;
  }

  const propertyValue = value[propertyName];
  if (typeof propertyValue === 'string' || typeof propertyValue === 'number') {
    return String(propertyValue);
  }

  return undefined;
};

const parseSerializedValue = <T>(input: unknown, fallback: T): T => {
  if (typeof input === 'string') {
    if (input.length === 0) {
      return fallback;
    }
    try {
      return JSON.parse(input) as T;
    } catch (_error) {
      return fallback;
    }
  }

  if (input === undefined || input === null) {
    return fallback;
  }

  return input as T;
};

const parseObjectParamValue = (queryParamKey: string, value: unknown): Record<string, unknown> => {
  if (_.isPlainObject(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (_.isPlainObject(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (_error) {
      throw Error(`${queryParamKey} must be a valid JSON object`);
    }
  }

  throw Error(`${queryParamKey} must be a valid JSON object`);
};

const containsOperatorKey = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.some(containsOperatorKey)
    : _.isPlainObject(value) &&
      Object.entries(value as Record<string, unknown>).some(([key, item]) => key.startsWith('$') || containsOperatorKey(item));

/**
 * A request-supplied value for a non-object parameter is placed directly at a
 * Mongo path, so a plain object would be interpreted as an operator document
 * (e.g. `{ $ne: true }`). Only parameters declared as `object` may carry objects.
 */
const isUnsafeParameterValue = (value: unknown): boolean =>
  _.isPlainObject(value) || (Array.isArray(value) && value.some(containsOperatorKey));

const DEFAULT_BOOTSTRAP_DATA_PATH = 'bootstrap-data';

export namespace Services {
  type RecordLike = AnyRecord & Partial<RecordModel> & { createdAt?: string | Date; updatedAt?: string | Date };
  type UserLike = AnyRecord & UserAttributes & { createdAt?: string | Date; updatedAt?: string | Date };

  /**
   * Named Query related functions...
   *
   */
  export class NamedQueryService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      "bootstrapData",
      "getNamedQueryConfig",
      "getSupportedCollections",
      "resolveBrandScope",
      "performNamedQuery",
      "performNamedQueryFromConfig",
      "performNamedQueryFromConfigResults",
      "create",
      "list",
      "getUsage",
      "update",
      "delete",
    ];

    public async bootstrapData(defBrand: BrandingModel) {
      const bootstrapPath = this.getBootstrapDataPath();
      let fileNames: string[] = [];
      const fileOps = this.getBootstrapFileOps();

      try {
        const fileEntries = await fileOps.readdir(bootstrapPath, { withFileTypes: true });
        fileNames = fileEntries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b));
      } catch (error) {
        const ioError = error as NodeJS.ErrnoException;
        if (ioError.code === 'ENOENT') {
          sails.log.verbose(`Named query bootstrap data path not found: ${bootstrapPath}`);
        } else {
          sails.log.error(`Failed to read named query bootstrap data path: ${bootstrapPath}`, error);
        }
      }

      for (const fileName of fileNames) {
        try {
          const filePath = path.join(bootstrapPath, fileName);
          const definition = await this.readJsonFile<NamedQueryDefinition>(filePath);
          if (!definition) {
            continue;
          }

          const name = fileName.replace(/\.json$/, '');
          assertNamedQueryDefinition(definition);
          if (!name || (namedQuerySource(definition) === 'database' && (!definition.collectionName || typeof definition.collectionName !== 'string'))) {
            sails.log.error(`Skipping named query bootstrap file with missing name or collectionName: ${fileName}`);
            continue;
          }

          const existing = await NamedQuery.findOne({ key: `${defBrand.id}_${name}` });
          if (existing) {
            sails.log.verbose(`Skipping existing named query bootstrap data: ${name}`);
            continue;
          }

          if (definition.source === 'graphql') {
            // Trusted files are imported without an execution identity. HTTP create
            // remains caller-aware and cannot opt into this private persistence path.
            let schema: GraphQLSchema;
            try {
              schema = await RecordGraphqlService.getBootstrapReadSchema(defBrand, sails.config.auth.defaultPortal);
            } catch {
              throw new GraphqlNamedQueryValidationError([
                graphqlDiagnostic('GRAPHQL_SCHEMA_UNAVAILABLE', 'graphql.document', 'The configured read schema is unavailable for import.'),
              ]);
            }
            const { validation } = validateGraphqlNamedQuery(definition, schema);
            if (!validation.valid) throw new GraphqlNamedQueryValidationError(validation.diagnostics);
            await this.persistNewDefinition(defBrand, name, definition);
          } else await this.create(defBrand, name, definition);
          sails.log.verbose(`Bootstrapped named query: ${name}`);
        } catch (error) {
          if (error instanceof GraphqlNamedQueryValidationError) {
            // Emit actionable safe locations, never documents, defaults or values.
            const details = error.diagnostics.slice(0, 10)
              .map(item => `${item.code} at ${item.field} (${item.line}:${item.column})`).join('; ');
            sails.log.error(`Failed to bootstrap named query from file: ${fileName}`, details);
          } else sails.log.error(`Failed to bootstrap named query from file: ${fileName}`, error);
        }
      }

      // File seeds run first. Config seeds never overwrite file or admin entries.
      for (const [name, definition] of Object.entries(sails.config.namedQuery?.queries ?? {})) {
        try {
          if (!name || !definition || typeof definition.collectionName !== 'string' || !definition.collectionName.length) {
            sails.log.error(`Skipping named query config seed with missing name or collectionName: ${name}`);
            continue;
          }
          if (await NamedQuery.findOne({ key: `${defBrand.id}_${name}` })) {
            sails.log.verbose(`Skipping existing named query bootstrap data: ${name}`);
            continue;
          }
          await this.create(defBrand, name, definition);
        } catch (error) {
          sails.log.error(`Failed to bootstrap named query from config: ${name}`, error);
        }
      }
    }

    private getBootstrapDataPath(): string {
      const configuredPath = _.get(sails.config, 'bootstrap.bootstrapDataPath', DEFAULT_BOOTSTRAP_DATA_PATH);
      return path.resolve(String(configuredPath), 'namedqueries');
    }

    protected getBootstrapFileOps(): Pick<typeof fs, 'readdir' | 'readFile'> {
      return fs;
    }

    private async readJsonFile<T>(filePath: string): Promise<T | null> {
      try {
        const content = await this.getBootstrapFileOps().readFile(filePath, 'utf8');
        return JSON.parse(content) as T;
      } catch (error) {
        sails.log.error(`Failed to read named query bootstrap file: ${path.basename(filePath)}`, error);
        return null;
      }
    }

    private getModel(collectionName: string): AnyRecord | undefined {
      return sails.models?.[collectionName] as AnyRecord | undefined;
    }

    public resolveBrandScope(collectionName: string): BrandScope {
      if (_.isEmpty(collectionName)) {
        throw new Error('collectionName is required');
      }

      if (collectionName === 'record') {
        return { type: 'field', fieldPath: 'metaMetadata.brandId' };
      }

      if (collectionName === 'user') {
        return { type: 'userRoles', fieldPath: '' };
      }

      const model = this.getModel(collectionName);
      if (!model) {
        throw new Error(`Invalid collectionName '${collectionName}': model not found`);
      }

      const attributes = model.attributes as Record<string, unknown> | undefined;
      if (attributes && Object.prototype.hasOwnProperty.call(attributes, 'branding')) {
        return { type: 'field', fieldPath: 'branding' };
      }

      throw new Error(`Invalid collectionName '${collectionName}': model does not expose a brand scope`);
    }

    private hasRoleInBrand(user: UserLike, brandId: string): boolean {
      return _.some(user.roles as unknown[] ?? [], (role: unknown) => {
        const roleObj = role as AnyRecord;
        const branding = roleObj?.branding;
        const roleBrandId = _.isObject(branding) ? String((branding as AnyRecord).id ?? '') : String(branding ?? '');
        return roleBrandId === brandId;
      });
    }

    private async getLinkedSecondaryUserIds(brandId: string, budget?: NamedQueryExecutionBudget): Promise<Set<string>> {
      if (typeof UserLink === 'undefined') {
        return new Set<string>();
      }
      const links = UserLink.find(budget ? { where: { brandId, status: 'active' }, limit: NAMED_QUERY_PREVIEW_LIMITS.scanRows + 1 } : { brandId, status: 'active' });
      const activeLinks = (budget ? await budget.wait(links) : await links) as unknown as AnyRecord[];
      budget?.scan(activeLinks.length);
      return new Set(
        _.map(activeLinks, (link: AnyRecord) => String(link.secondaryUserId ?? '')).filter((id: string) => id !== '')
      );
    }

    private sanitizeUserForNamedQuery(user: UserLike): UserLike {
      const sanitized = { ...user };
      delete sanitized.password;
      delete sanitized.token;
      return sanitized;
    }

    private getMongoQueryValue(mongoQuery: Record<string, unknown>, path: string): unknown {
      return Object.prototype.hasOwnProperty.call(mongoQuery, path) ? mongoQuery[path] : _.get(mongoQuery, path);
    }

    private setMongoQueryValue(mongoQuery: Record<string, unknown>, path: string, value: unknown): void {
      if (path.includes('.')) {
        mongoQuery[path] = value;
      } else {
        _.set(mongoQuery, path, value);
      }
    }

    private unsetMongoQueryValue(mongoQuery: Record<string, unknown>, path: string): void {
      if (Object.prototype.hasOwnProperty.call(mongoQuery, path)) {
        delete mongoQuery[path];
      } else {
        _.unset(mongoQuery, path);
      }
    }

    private unsetIgnoredQueryParameter(mongoQuery: Record<string, unknown>, queryParam: QueryParameterDefinition): void {
      const existing = this.getMongoQueryValue(mongoQuery, queryParam.path);
      if (queryParam.type === DataType.Date && queryParam.queryType && _.isPlainObject(existing)) {
        // Date bounds can share a path. Remove only this parameter's comparison,
        // retaining supplied sibling bounds and unrelated static operators.
        const remaining = _.omit(existing as Record<string, unknown>, queryParam.queryType);
        if (!_.isEmpty(remaining)) {
          this.setMongoQueryValue(mongoQuery, queryParam.path, remaining);
          return;
        }
      }
      this.unsetMongoQueryValue(mongoQuery, queryParam.path);
    }

    private isQueryOperatorObject(value: Record<string, unknown>): boolean {
      return Object.keys(value).some((key) => key.startsWith('$') || [
        'contains',
        'startsWith',
        'endsWith',
        'like',
        '>',
        '>=',
        '<',
        '<=',
        '!=',
        'in',
        'nin',
      ].includes(key));
    }

    private flattenDeepTargetCriteria(criteria: Record<string, unknown>, prefix = ''): Record<string, unknown> {
      const flattened: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(criteria)) {
        const path = prefix ? `${prefix}.${key}` : key;

        if (_.isPlainObject(value) && !this.isQueryOperatorObject(value as Record<string, unknown>)) {
          Object.assign(flattened, this.flattenDeepTargetCriteria(value as Record<string, unknown>, path));
        } else {
          flattened[path] = value;
        }
      }

      return flattened;
    }

    private toNativeMongoCriteria(
      criteria: Record<string, unknown>,
      queryParams: Record<string, QueryParameterDefinition>
    ): Record<string, unknown> {
      const mongoCriteria: Record<string, unknown> = {};
      const datePaths = new Set(Object.values(queryParams).filter(param => param.type === DataType.Date).map(param => param.path));
      const dateComparisons: Record<string, unknown>[] = [];
      const dateOperators = new Set(['$gt', '$gte', '$lt', '$lte', '$eq', '$ne']);
      const operatorMap: Record<string, string> = {
        '>': '$gt',
        '>=': '$gte',
        '<': '$lt',
        '<=': '$lte',
        '!=': '$ne',
        in: '$in',
        nin: '$nin',
      };

      for (const [key, criterion] of Object.entries(criteria)) {
        // A date parameter without queryType is an equality comparison. Leave
        // null/undefined sentinels unchanged so omitted filters retain their meaning.
        const value = datePaths.has(key) && criterion != null && !_.isPlainObject(criterion)
          ? { $eq: criterion }
          : criterion;
        if (_.isPlainObject(value)) {
          const mappedValue: Record<string, unknown> = {};
          for (const [operator, operatorValue] of Object.entries(value as Record<string, unknown>)) {
            const nativeOperator = operatorMap[operator] ?? operator;
            if (datePaths.has(key) && dateOperators.has(nativeOperator)) {
              // Stored UTC strings and offset ISO strings must compare as instants.
              // Conversion also accepts BSON dates without rewriting stored records.
              dateComparisons.push({
                $let: {
                  vars: {
                    stored: { $convert: { input: `$${key}`, to: 'date', onError: null, onNull: null } },
                    bound: { $convert: { input: { $literal: operatorValue }, to: 'date', onError: null, onNull: null } },
                  },
                  in: {
                    $and: [
                      { $ne: ['$$stored', null] },
                      { $ne: ['$$bound', null] },
                      { [nativeOperator]: ['$$stored', '$$bound'] },
                    ],
                  },
                },
              });
            } else if (operator === 'contains') {
              mappedValue.$regex = _.escapeRegExp(String(operatorValue ?? ''));
              mappedValue.$options = 'i';
            } else {
              mappedValue[nativeOperator] = operatorValue;
            }
          }
          if (!_.isEmpty(mappedValue)) mongoCriteria[key] = mappedValue;
        } else {
          mongoCriteria[key] = value;
        }
      }

      return dateComparisons.length > 0
        ? { $and: [mongoCriteria, { $expr: { $and: dateComparisons } }] }
        : mongoCriteria;
    }

    private toNativeMongoSort(sort: NamedQuerySortConfig | undefined): Record<string, 1 | -1> {
      const mongoSort: Record<string, 1 | -1> = {};

      for (const sortEntry of sort ?? []) {
        for (const [field, direction] of Object.entries(sortEntry)) {
          mongoSort[field] = direction === 'DESC' ? -1 : 1;
        }
      }

      return mongoSort;
    }

    private async getNativeRecordCollection(model: AnyRecord): Promise<NativeRecordCollection> {
      const native = model.native;
      if (typeof native !== 'function') {
        throw new Error("Model record does not expose native collection access");
      }

      return new Promise<NativeRecordCollection>((resolve, reject) => {
        const nativeFn = native as (callback: (error: Error | null, collection: NativeRecordCollection) => void) => void;
        nativeFn((error: Error | null, collection: NativeRecordCollection) => {
          if (error) {
            reject(error);
          } else {
            resolve(collection);
          }
        });
      });
    }

    /** Persist only the selected source, preserving untouched database JSON bytes. */
    private serializeDefinition(brand: BrandingModel, name: string, config: NamedQueryDefinition, existing?: NamedQueryAttributes): Partial<NamedQueryAttributes> {
      const common: Partial<NamedQueryAttributes> = {
        name, branding: brand.id,
        description: config.description ?? existing?.description ?? null,
      };
      if (config.source === 'graphql') {
        return {
          ...common, source: 'graphql', graphql: JSON.stringify(config.graphql),
          collectionName: null, mongoQuery: null, queryParams: null,
          resultObjectMapping: null, brandIdFieldPath: null, sort: null,
          relatedRecordFilters: null, expandRelations: false,
        };
      }
      // GraphQL has brand ownership through the association, not a database scope path.
      const brandScope = this.resolveBrandScope(config.collectionName);
      const replacing = existing?.source != null && existing.source !== 'database';
      if (replacing) {
        for (const field of ['mongoQuery', 'queryParams', 'resultObjectMapping'] as const) {
          if (config[field] === undefined) throw new NamedQueryDefinitionError(field);
        }
      }
      const serialize = (stored: string | null | undefined, value: unknown, changed = JSON.stringify(value)) =>
        stored && _.isEqual(parseSerializedValue(stored, undefined), value) ? stored : changed;
      const brandIdFieldPath = existing?.collectionName === config.collectionName &&
        existing?.brandIdFieldPath === config.brandIdFieldPath ? existing.brandIdFieldPath : brandScope.fieldPath;
      return {
        ...common,
        // Preserve an explicit database source when a legacy editor omits it.
        ...(config.source !== undefined ? { source: config.source } :
          existing?.source === 'database' ? { source: 'database' } : replacing ? { source: null } : {}),
        ...(replacing ? { graphql: null } : {}),
        collectionName: config.collectionName,
        mongoQuery: serialize(existing?.mongoQuery, config.mongoQuery),
        queryParams: serialize(existing?.queryParams, config.queryParams),
        resultObjectMapping: serialize(existing?.resultObjectMapping, config.resultObjectMapping),
        brandIdFieldPath,
        sort: serialize(existing?.sort, config.sort ?? [], Array.isArray(config.sort) && config.sort.length > 0 ? JSON.stringify(config.sort) : ''),
        expandRelations: config.expandRelations === true,
        relatedRecordFilters: serialize(existing?.relatedRecordFilters, config.relatedRecordFilters ?? [],
          Array.isArray(config.relatedRecordFilters) && config.relatedRecordFilters.length > 0 ? JSON.stringify(config.relatedRecordFilters) : ''),
      };
    }

    public async create(brand: BrandingModel, name: string, input: unknown, validationCaller?: ReadCaller) {
      assertNamedQueryDefinition(input);
      if (input.source === 'graphql') {
        const { validation } = await inspectGraphqlNamedQuery(input, validationCaller, String(brand.id));
        if (!validation.valid) throw new GraphqlNamedQueryValidationError(validation.diagnostics);
      }
      return this.persistNewDefinition(brand, name, input);
    }

    private async persistNewDefinition(brand: BrandingModel, name: string, input: NamedQueryDefinition) {
      const key = `${brand.id}_${name}`;
      const existing = await NamedQuery.findOne({ key });
      if (existing) throw new Error(`Named query '${name}' already exists`);
      return firstValueFrom(super.getObservable(NamedQuery.create(this.serializeDefinition(brand, name, input))));
    }

    public async list(brand: BrandingModel) {
      const records = await NamedQuery.find({ branding: brand.id }) as NamedQueryAttributes[];
      return records.map(r => {
        try {
          namedQuerySource({ source: r.source ?? undefined });
        } catch (error) {
          if (!(error instanceof NamedQueryDefinitionError)) throw error;
          // Keep a damaged row identifiable/deletable without treating its stored
          // execution fields as a database definition or hiding unrelated rows.
          const invalid: InvalidNamedQueryCatalogueEntry = {
            name: r.name, source: r.source, valid: false,
            diagnostics: [{
              code: 'INVALID_NAMED_QUERY_SOURCE', severity: 'error', capability: 'definition',
              field: 'source', reason: 'The saved named query has an unsupported source.',
              line: 1, column: 1,
            }],
          };
          return invalid;
        }
        if (r.source === 'graphql') return {
          name: r.name, source: 'graphql' as const,
          ...(r.description != null ? { description: r.description } : {}),
          graphql: parseSerializedValue<GraphqlNamedQueryOperation | undefined>(r.graphql, undefined),
        };
        return {
          name: r.name,
          ...(r.source === 'database' ? { source: 'database' as const } : {}),
          ...(r.description != null ? { description: r.description } : {}),
          collectionName: r.collectionName ?? '',
          mongoQuery: parseSerializedValue<Record<string, unknown>>(r.mongoQuery, {}),
          queryParams: parseSerializedValue<Record<string, NamedQueryParam>>(r.queryParams, {}),
          resultObjectMapping: parseSerializedValue<Record<string, string>>(r.resultObjectMapping, {}),
          brandIdFieldPath: r.brandIdFieldPath || undefined,
          sort: r.sort ? parseSerializedValue<Array<Record<string, 'ASC' | 'DESC'>>>(r.sort, []) : undefined,
          expandRelations: r.expandRelations || false,
          relatedRecordFilters: r.relatedRecordFilters ? parseSerializedValue<RelatedRecordFilter[]>(r.relatedRecordFilters, []) : undefined,
        };
      });
    }

    /** Constant number of brand-scoped reads, shared by the whole list. */
    public async getUsage(brand: BrandingModel): Promise<NamedQueryUsage> {
      const reports = (await RBReport.find({ branding: brand.id })) as AnyRecord[];
      const dashboards = await DashboardConfiguration.findOne({ branding: String(brand.id) });
      const dashboardTypes = (await DashboardType.find({ branding: brand.id })) as AnyRecord[];
      const recordTypes = (await RecordType.find({ branding: brand.id })) as AnyRecord[];
      const workflowSteps = recordTypes.length
        ? (await WorkflowStep.find({ recordType: { in: recordTypes.map(type => String(type.id)) } })) as AnyRecord[] : [];
      const forms = (await Form.find({ branding: brand.id })) as AnyRecord[];
      // Use the same effective brand settings as runtime consumers: this includes
      // defaults and excludes superseded duplicate rows, with secrets masked.
      const appConfiguration = AppConfigService.getMaskedAppConfigurationForBrand(brand.name);
      const appConfigs = Object.entries(appConfiguration && typeof appConfiguration === 'object' ? appConfiguration : {})
        .map(([configKey, configData]) => ({ configKey, configData }));
      return buildNamedQueryUsage({ reports, dashboards: dashboards?.configData, dashboardTypes,
        recordTypes, workflowSteps, forms, appConfigs,
        views: sails.config.dashboardview ?? {}, vocabularies: sails.config.vocab?.queries ?? {} });
    }

    public async update(brand: BrandingModel, name: string, input: unknown, validationCaller?: ReadCaller) {
      assertNamedQueryDefinition(input);
      if (input.source === 'graphql') {
        const { validation } = await inspectGraphqlNamedQuery(input, validationCaller, String(brand.id));
        if (!validation.valid) throw new GraphqlNamedQueryValidationError(validation.diagnostics);
      }
      const key = `${brand.id}_${name}`;
      const existing = await NamedQuery.findOne({ key });
      if (!existing) throw new Error(`Named query '${name}' not found`);
      const serialized = this.serializeDefinition(brand, name, input, existing);
      const updated = await firstValueFrom(super.getObservable(NamedQuery.updateOne({ key }).set(serialized)));
      if (!updated) throw new Error(`Named query '${name}' not found`);
      return updated;
    }

    public async delete(brand: BrandingModel, name: string) {
      const key = `${brand.id}_${name}`;
      const existing = await NamedQuery.findOne({ key });
      if (!existing) {
        throw new Error(`Named query '${name}' not found`);
      }
      const consumers = (await this.getUsage(brand))[name] ?? [];
      if (consumers.length) throw new NamedQueryInUseError(consumers);
      return firstValueFrom(super.getObservable(NamedQuery.destroyOne({ key })));
    }

    async getNamedQueryConfig(brand: BrandingModel, namedQuery: string): Promise<ResolvedNamedQueryConfig | null> {
      const nQDBEntry = await NamedQuery.findOne({
        key: brand.id + "_" + namedQuery
      });
      if (nQDBEntry) {
        return readNamedQueryConfig(nQDBEntry)
      }

      return null;
    }

    getSupportedCollections(): string[] {
      const collections = _.get(sails.config, ['namedQuery', 'supportedCollections'], []) as unknown;
      return Array.isArray(collections) ? collections.filter((c): c is string => typeof c === 'string') : [];
    }

    /** Declared filters are trusted configuration; parameters can only replace literal leaves. */
    private async declaredRelationCriteria(
      filters: RelatedRecordFilter[], collectionName: string, queryParams: Record<string, QueryParameterDefinition>,
      paramMap: Record<string, unknown>, brand: BrandingModel, user: unknown, sort: NamedQuerySortConfig | undefined
    ): Promise<Record<string, unknown>[]> {
      const principal = user as { username?: string; roles?: Array<{ name: string; branding: unknown }> };
      if (collectionName !== 'record' || !principal?.username || !Array.isArray(principal.roles)) {
        throw new Error('Declared relation filters require an authenticated record query');
      }
      const safePath = (path: string) => typeof path === 'string' && path.length > 0 &&
        _.toPath(path).every(token => /^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) &&
        _.toPath(path).join('.') === path;
      for (const entry of sort ?? []) for (const [field, direction] of Object.entries(entry)) {
        if (!safePath(field) || !(field === 'redboxOid' || field === 'lastSaveDate' || field === 'dateCreated' ||
          field.startsWith('metadata.') || field.startsWith('metaMetadata.')) || !['ASC', 'DESC'].includes(direction)) {
          throw new Error('Unsupported declared relation sort');
        }
      }
      const roles = principal.roles.filter(role => {
        const brandingId = typeof role.branding === 'object' ? (role.branding as { id?: unknown })?.id : role.branding;
        return brandingId != null && String(brandingId) === String(brand.id);
      }).map(role => role.name);
      const acl = { $or: [
        { 'authorization.view': principal.username }, { 'authorization.edit': principal.username },
        { 'authorization.viewRoles': { $in: roles } }, { 'authorization.editRoles': { $in: roles } }
      ] };
      const criteria: Record<string, unknown>[] = [acl];
      const groups = new Map<string, RelatedRecordFilter[]>();
      for (const filter of filters) {
        if (!filter.rootRecordType || !filter.relationId ||
          Object.keys(filter).some(key => !['rootRecordType', 'relationId', 'mongoQuery', 'collectionName', 'localField', 'foreignField'].includes(key))) {
          throw new Error('Unsupported declared relation filter');
        }
        const key = JSON.stringify([filter.rootRecordType, filter.relationId]);
        groups.set(key, [...(groups.get(key) ?? []), filter]);
      }
      const native = await this.getNativeRecordCollection(this.getModel('record')!);
      for (const group of groups.values()) {
        const { rootRecordType, relationId } = group[0];
        const summary = await (sails.services.recordsservice as unknown as { getRecordTypeSummary(brand: BrandingModel, type: string): Promise<{ relatedTo: import('../config/recordtype.config').RecordRelation[] } | null> }).getRecordTypeSummary(brand, rootRecordType!);
        const relations = summary?.relatedTo.filter(relation => relation.id === relationId) ?? [];
        if (relations.length !== 1) throw new Error('Unknown declared relation');
        const relation = relations[0];
        const local = relation.localField || 'redboxOid';
        if (!safePath(local) || !safePath(relation.foreignField) || (relation.oidProperty && !safePath(relation.oidProperty))) {
          throw new Error('Unsupported literal-field relation query path');
        }
        const predicates = group.map(filter => {
          const predicate = _.cloneDeep(filter.mongoQuery);
          const params = _.pickBy(queryParams, param => this.getMongoQueryValue(predicate, param.path) !== undefined);
          this.setParamsInQuery(predicate, params, paramMap, undefined, true);
          const validate = (value: unknown): void => {
            if (Array.isArray(value)) { value.forEach(validate); return; }
            if (!_.isPlainObject(value)) return;
            for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
              if (key.startsWith('$') && !['$and', '$or', '$nor', '$eq', '$ne', '$in', '$nin', '$gt', '$gte', '$lt', '$lte', '$exists', '$not', '$regex', '$options', '$elemMatch'].includes(key)) {
                throw new Error('Unsupported relation aggregation or predicate');
              }
              if (!key.startsWith('$') && !['>', '>=', '<', '<=', '!='].includes(key) && !safePath(key)) throw new Error('Unsupported literal-field query path');
              validate(child);
            }
          };
          validate(predicate);
          return this.toNativeMongoCriteria(this.flattenDeepTargetCriteria(predicate), params);
        });
        const sources = await native.find({ $and: [
          { 'metaMetadata.brandId': brand.id, 'metaMetadata.type': relation.recordType }, acl, ...predicates
        ] }, { maxTimeMS: 10_000 }).limit(1001).toArray();
        if (sources.length > 1000) throw new Error('Declared relation source ID limit exceeded');
        const ids = _.uniq(sources.flatMap(source => {
          // Mongo dotted paths traverse object arrays; Lodash get alone does not.
          // Walk those arrays, then reuse the resolver's reference normalization.
          const read = (value: unknown, tokens: string[]): unknown[] => {
            if (!tokens.length) return [value];
            if (Array.isArray(value)) return value.flatMap(item => read(item, tokens));
            return read(_.get(value, [tokens[0]]), tokens.slice(1));
          };
          return read(source, _.toPath(relation.foreignField)).flatMap(value => {
            const references = normalizeRelatedReferences(value);
            if (references.invalidIndices.length) throw new Error('Unsupported relation identifier');
            return references.values;
          });
        }));
        if (ids.length > 1000) throw new Error('Declared relation source ID limit exceeded');
        // Objects and scalar references share the same authorized source set.
        const reference = relation.oidProperty
          ? { $or: [{ [local]: { $in: ids } }, { [`${local}.${relation.oidProperty}`]: { $in: ids } }] }
          : { [local]: { $in: ids } };
        criteria.push({ 'metaMetadata.type': rootRecordType }, reference);
      }
      return criteria;
    }

    async performNamedQuery(
      _brandIdFieldPath: string,
      resultObjectMapping: Record<string, unknown>,
      collectionName: string,
      mongoQuery: Record<string, unknown>,
      queryParams: Record<string, QueryParameterDefinition>,
      paramMap: Record<string, unknown>,
      brand: BrandingModel,
      start: number,
      rows: number,
      _user: unknown = undefined,
      sort: NamedQuerySortConfig | undefined = undefined,
      expandRelations: boolean = false,
      relatedRecordFilters: RelatedRecordFilter[] = [],
      budget?: NamedQueryExecutionBudget
    ): Promise<ListAPIResponse<NamedQueryResponseRecord>> {
      // A response timer cannot cancel Waterline/populate or hook database operations.
      // Refuse those paths before any I/O when running a draft preview budget.
      // Declared relation filters are relatedRecordFilters, so they never reach the budget path.
      if (budget && previewDeadlineIssue({ collectionName, expandRelations, relatedRecordFilters }))
        throw new NamedQueryAssistanceError('PREVIEW_DEADLINE_UNSUPPORTED', 422);
      const criteriaMeta = { enableExperimentalDeepTargets: true, ...(budget ? { maxTimeMS: budget.remaining() } : {}) };
      const declared = relatedRecordFilters.filter(filter => filter.rootRecordType !== undefined || filter.relationId !== undefined);
      const declaredCriteria = declared.length ? await this.declaredRelationCriteria(declared, collectionName, queryParams, paramMap, brand, _user, sort) : [];
      if (declared.length && !(sort ?? []).some(entry => 'redboxOid' in entry)) sort = [...(sort ?? []), { redboxOid: 'ASC' }];
      const rootQueryParams = declared.length
        ? _.pickBy(queryParams, param => this.getMongoQueryValue(mongoQuery, param.path) !== undefined)
        : queryParams;
      if (budget) budget.run(() => this.setParamsInQuery(mongoQuery, rootQueryParams, paramMap, budget, declared.length > 0));
      else this.setParamsInQuery(mongoQuery, rootQueryParams, paramMap, undefined, declared.length > 0);
      if (budget?.outputTruncated) return new ListAPIResponse<NamedQueryResponseRecord>();

      if (relatedRecordFilters && relatedRecordFilters.length > 0) {
        for (const filter of relatedRecordFilters.filter(filter => !declared.includes(filter))) {
          const filterModel = sails.models[filter.collectionName];
          if (!filterModel) {
            this.updateChronicle(
              { namedQueryFilterCollection: filter.collectionName, namedQueryFilterOutcome: 'model-missing' },
              [],
              'warn'
            );
            continue;
          }
          const filterMongoQuery = _.cloneDeep(filter.mongoQuery);
          const filterQueryParams = _.pickBy(queryParams, (queryParam) => _.has(filterMongoQuery, queryParam.path));
          if (budget) budget.run(() => this.setParamsInQuery(filterMongoQuery, filterQueryParams, paramMap, budget, declared.length > 0));
          else this.setParamsInQuery(filterMongoQuery, filterQueryParams, paramMap, undefined, declared.length > 0);
          if (budget) budget.run(() => budget.query(filterMongoQuery));
          const scope = budget ? this.resolveBrandScope(filter.collectionName) : undefined;
          const filterCriteria = budget ? this.flattenDeepTargetCriteria(filterMongoQuery) : filterMongoQuery;
          if (scope?.type === 'field') this.setMongoQueryValue(filterCriteria, scope.fieldPath, brand.id);
          let relatedRecords: AnyRecord[];
          if (budget && scope?.type === 'userRoles') {
            relatedRecords = await this.scopedUsers(filterCriteria, brand, undefined, budget);
          } else {
            const relatedOperation = filterModel.find({ where: filterCriteria, select: [filter.foreignField],
              ...(budget ? { limit: NAMED_QUERY_PREVIEW_LIMITS.scanRows + 1 } : {}) }).meta(criteriaMeta);
            relatedRecords = (budget ? await budget.wait(relatedOperation) : await relatedOperation) as unknown as AnyRecord[];
          }
          budget?.scan(relatedRecords.length);
          const relatedIds = _.uniq(relatedRecords.map((relatedRecord) => _.get(relatedRecord, filter.foreignField)).filter((id) => id != null && id !== ''));
          const existingLocalFieldFilter = this.getMongoQueryValue(mongoQuery, filter.localField);
          const existingRelatedIds = _.isPlainObject(existingLocalFieldFilter) ? _.get(existingLocalFieldFilter, '$in') : undefined;
          if (Array.isArray(existingRelatedIds)) {
            this.setMongoQueryValue(mongoQuery, filter.localField, {
              $in: _.intersection(existingRelatedIds, relatedIds)
            });
          } else {
            this.setMongoQueryValue(mongoQuery, filter.localField, { $in: relatedIds });
          }
        }
      }

      if (budget) budget.run(() => budget.query(mongoQuery));
      const brandScope = this.resolveBrandScope(collectionName);
      const that = this;
      if (brandScope.type === 'userRoles') {
        return this.performUserNamedQuery(resultObjectMapping, mongoQuery, brand, start, rows, sort, budget);
      }

      this.setMongoQueryValue(mongoQuery, brandScope.fieldPath, brand.id);
      const waterlineQuery = this.flattenDeepTargetCriteria(mongoQuery);
      // Nested and dotted forms can collide during flattening. The final criterion is authoritative.
      waterlineQuery[brandScope.fieldPath] = brand.id;
      this.updateChronicle({ namedQueryCollection: collectionName, namedQueryStart: start, namedQueryRows: rows });

      // Get the total count of matching records
      let totalItems = 0;
      const model = this.getModel(collectionName);
      if (!model) {
        throw new Error(`Model ${collectionName} not found`);
      }
      if (budget && typeof model.native !== 'function')
        throw new NamedQueryAssistanceError('PREVIEW_DEADLINE_UNSUPPORTED', 422);
      let results: Array<RecordLike | UserLike> = [];
      if (collectionName === 'record') {
        const collectionOperation = this.getNativeRecordCollection(model);
        const nativeCollection = budget ? await budget.wait(collectionOperation) : await collectionOperation;
        const rootCriteria = this.toNativeMongoCriteria(waterlineQuery, queryParams);
        const nativeCriteria = declaredCriteria.length ? { $and: [rootCriteria, ...declaredCriteria] } : rootCriteria;
        const countOperation = nativeCollection.countDocuments(nativeCriteria, budget ? { maxTimeMS: budget.remaining() } : undefined);
        totalItems = budget ? await budget.wait(countOperation) : await countOperation;
        if (totalItems > 0) {
          let nativeQuery = nativeCollection.find(nativeCriteria, budget ? { maxTimeMS: budget.remaining() } : undefined);
          const nativeSort = this.toNativeMongoSort(sort);
          if (!_.isEmpty(nativeSort)) {
            nativeQuery = nativeQuery.sort(nativeSort);
          }
          const resultsOperation = nativeQuery.skip(start).limit(rows).toArray();
          results = (budget ? await budget.wait(resultsOperation) : await resultsOperation) as Array<RecordLike | UserLike>;
        }
      } else {
        const count = model.count;
        if (typeof count !== 'function') {
          throw new Error(`Model ${collectionName} does not expose count`);
        }
        const countFn = count as (criteria: Record<string, unknown>) => { meta: (criteriaMeta: Record<string, unknown>) => Promise<number> };
        const countOperation = countFn(waterlineQuery).meta(criteriaMeta);
        totalItems = budget ? await budget.wait(countOperation) : await countOperation;
      }

      // Build query criteria
      const criteria: { where: Record<string, unknown>; skip: number; limit: number; sort?: NamedQuerySortConfig } = {
        where: waterlineQuery,
        skip: start,
        limit: rows,
      };

      // Add sorting
      if (sort !== undefined && Array.isArray(sort) && (sort?.length ?? 0) > 0) {
        // e.g. [{ name:  'ASC'}, { age: 'DESC' }]
        criteria['sort'] = sort;
      }

      // Run query
      this.updateChronicle({ namedQueryTotalItems: totalItems });
      if (collectionName !== 'record' && totalItems > 0) {
        const find = model.find;
        if (typeof find !== 'function') {
          throw new Error(`Model ${collectionName} does not expose find`);
        }
        const findFn = find as (findCriteria: { where: Record<string, unknown>; skip: number; limit: number; sort?: NamedQuerySortConfig }) => { meta: (criteriaMeta: Record<string, unknown>) => Promise<Array<RecordLike | UserLike>> };
        const resultsOperation = findFn(criteria).meta(criteriaMeta);
        results = budget ? await budget.wait(resultsOperation) : await resultsOperation;
      }

      const responseRecords: NamedQueryResponseRecord[] = []
      const recordsService = sails.services.recordsservice as unknown as RecordsService | undefined;
      const expandRelationsActual = expandRelations === true && collectionName === 'record';
      if (expandRelations === true && collectionName !== 'record') {
        this.updateChronicle({ namedQueryRelationsIgnored: true });
      }

      // 'user' collections are scoped and rendered separately via performUserNamedQuery,
      // so anything reaching this loop is a record-like (record or scoped dynamic) model.
      budget?.scan(results.length);
      for (const record of (budget ? results.slice(0, rows) : results)) {
        budget?.remaining();
        const recordItem = record as RecordLike;

        if (expandRelationsActual && recordsService && recordItem.redboxOid) {
          try {
            const relationOperation = recordsService.getRelatedRecords(recordItem.redboxOid, brand);
            const relationships = budget ? await budget.wait(relationOperation) : await relationOperation;
            recordItem.relationships = relationships;
          } catch (err) {
            if (budget && err instanceof NamedQueryAssistanceError) throw err;
            this.updateChronicle(
              { namedQueryRelationshipOid: recordItem.redboxOid, namedQueryRelationshipOutcome: 'failed' },
              [err]
            );
          }
        }

        let defaultMetadata: NamedQueryResponseMetadata = {};
        const variables: Record<string, unknown> = { record: recordItem };
        if (!_.isEmpty(resultObjectMapping)) {
          const resultMetadata = _.cloneDeep(resultObjectMapping);
          for (const [key, value] of Object.entries(resultObjectMapping)) {
            let mapped: unknown;
            try {
              mapped = budget ? budget.run(() => that.runTemplate(value as string, variables, budget)) : that.runTemplate(value as string, variables);
            } catch (error) {
              if (!budget || !(error instanceof NamedQueryPreviewOutputLimitError || error instanceof RangeError)) throw error;
              budget.outputTruncated = true;
              break;
            }
            if (budget && !budget.output({ [key]: mapped })) break;
            _.set(resultMetadata, key, mapped);
          }
          defaultMetadata = resultMetadata as NamedQueryResponseMetadata;
        } else {
          defaultMetadata = collectionName === 'record'
            ? that.runTemplate('record.metadata', variables) as NamedQueryResponseMetadata
            : recordItem as unknown as NamedQueryResponseMetadata;
          if (budget && !budget.output(defaultMetadata)) break;
        }
        if (budget?.outputTruncated) break;

        const responseRecord: NamedQueryResponseRecord = new NamedQueryResponseRecord({
          oid: recordItem.redboxOid ?? getIdentifierProperty(recordItem, 'id') ?? '',
          title: getStringProperty(recordItem.metadata, 'title') ?? getStringProperty(recordItem, 'name') ?? getStringProperty(recordItem, 'title') ?? '',
          metadata: defaultMetadata,
          lastSaveDate: recordItem.lastSaveDate ?? null,
          dateCreated: recordItem.dateCreated ?? null
        });
        if (budget && !budget.output({ ...responseRecord, metadata: undefined })) break;
        responseRecords.push(responseRecord);
      }
      const response = new ListAPIResponse<NamedQueryResponseRecord>();

      const startIndex = start;
      const noItems = rows;
      const pageNumber = Math.floor((startIndex / noItems) + 1);

      response.records = responseRecords;
      response.summary.start = start
      response.summary.page = pageNumber
      response.summary.numFound = totalItems;

      return response;
    }

    private async scopedUsers(
      mongoQuery: Record<string, unknown>, brand: BrandingModel,
      sort?: NamedQuerySortConfig, budget?: NamedQueryExecutionBudget
    ): Promise<UserLike[]> {
      const criteriaMeta = { enableExperimentalDeepTargets: true, ...(budget ? { maxTimeMS: budget.remaining() } : {}) };
      const model = this.getModel('user');
      if (!model) {
        throw new Error(`Invalid collectionName 'user': model not found`);
      }
      const userModel = model as { find: (criteria: { where: Record<string, unknown>; sort?: NamedQuerySortConfig }) => unknown };

      const criteria: { where: Record<string, unknown>; sort?: NamedQuerySortConfig; limit?: number } = {
        where: mongoQuery, ...(budget ? { limit: NAMED_QUERY_PREVIEW_LIMITS.scanRows + 1 } : {})
      };
      if (sort !== undefined && Array.isArray(sort) && (sort?.length ?? 0) > 0) {
        criteria.sort = sort;
      }

      let query = userModel.find(criteria) as AnyRecord;
      if (query && typeof query.populate === 'function') {
        query = query.populate('roles');
      }
      const usersOperation = query && typeof query.meta === 'function' ? query.meta(criteriaMeta) : query;
      const allUsers = (budget ? await budget.wait(Promise.resolve(usersOperation)) : await usersOperation) as unknown as UserLike[];
      budget?.scan(allUsers.length);

      const brandId = String(brand.id);
      const linkedSecondaryUserIds = await this.getLinkedSecondaryUserIds(brandId, budget);
      return allUsers
        .filter((user) => this.hasRoleInBrand(user, brandId) || linkedSecondaryUserIds.has(String(user.id ?? '')))
        .map((user) => this.sanitizeUserForNamedQuery(user));
    }

    private async performUserNamedQuery(
      resultObjectMapping: Record<string, unknown>,
      mongoQuery: Record<string, unknown>,
      brand: BrandingModel,
      start: number,
      rows: number,
      sort: NamedQuerySortConfig | undefined = undefined,
      budget?: NamedQueryExecutionBudget
    ): Promise<ListAPIResponse<NamedQueryResponseRecord>> {
      const scopedUsers = await this.scopedUsers(mongoQuery, brand, sort, budget);
      const pagedUsers = scopedUsers.slice(start, start + rows);
      const responseRecords: NamedQueryResponseRecord[] = [];

      for (const userRecord of pagedUsers) {
        budget?.remaining();
        let defaultMetadata: NamedQueryResponseMetadata = {};
        const variables: Record<string, unknown> = { record: userRecord };
        if (!_.isEmpty(resultObjectMapping)) {
          const resultMetadata = _.cloneDeep(resultObjectMapping);
          _.forOwn(resultObjectMapping, (value: unknown, key: string) => {
            _.set(resultMetadata, key, budget ? budget.run(() => this.runTemplate(value as string, variables)) : this.runTemplate(value as string, variables));
          });
          defaultMetadata = resultMetadata as NamedQueryResponseMetadata;
        } else {
          defaultMetadata = {
            type: this.runTemplate('record.type', variables),
            name: this.runTemplate('record.name', variables),
            email: this.runTemplate('record.email', variables),
            username: this.runTemplate('record.username', variables),
            lastLogin: this.runTemplate('record.lastLogin', variables)
          };
        }

        responseRecords.push(new NamedQueryResponseRecord({
          oid: '',
          title: '',
          metadata: defaultMetadata,
          lastSaveDate: userRecord.updatedAt ?? null,
          dateCreated: userRecord.createdAt ?? null
        }));
      }

      const response = new ListAPIResponse<NamedQueryResponseRecord>();
      response.records = responseRecords;
      response.summary.start = start;
      response.summary.page = Math.floor((start / rows) + 1);
      response.summary.numFound = scopedUsers.length;
      return response;
    }

    setParamsInQuery(mongoQuery: Record<string, unknown>, queryParams: Record<string, QueryParameterDefinition>, paramMap: Record<string, unknown>, budget?: NamedQueryExecutionBudget, literalParameters = false) {
      for (const queryParamKey in queryParams) {
        let value = paramMap[queryParamKey];
        const queryParam: QueryParameterDefinition = queryParams[queryParamKey];

        if (_.isUndefined(value) && queryParam.required === true) {
          throw Error(`${queryParamKey} is a required parameter`);
        }

        if (_.isUndefined(value)) {
          if (queryParam.whenUndefined == NamedQueryWhenUndefinedOptions.ignore) {
            this.unsetIgnoredQueryParameter(mongoQuery, queryParam);
            continue;
          }

          if (queryParam.whenUndefined == NamedQueryWhenUndefinedOptions.defaultValue) {
            value = queryParam.defaultValue;
          }
        }

        if (queryParam.template !== undefined && !_.isEmpty(queryParam.template)) {
          value = this.runTemplate(queryParam.template, { value: value, queryParams: queryParams, paramMap: paramMap }, budget);
          if (budget?.outputTruncated) return mongoQuery;
        }

        // Validate the evaluated template result, including values selected from
        // undeclared request parameters, before coercion can hide its shape.
        const primitive = (item: unknown): boolean => item == null ||
          ['string', 'number', 'boolean', 'undefined'].includes(typeof item);
        if (literalParameters && !(primitive(value) ||
          (queryParam.type === DataType.Array && Array.isArray(value) && value.every(primitive)))) {
          throw new Error('Relation parameters must be literal values of the declared type');
        }

        if (queryParam.type == DataType.Number) {
          if (!_.isUndefined(value) && value !== null && value !== '') {
            value = _.toNumber(value)
          }
        }

        if (queryParam.type == DataType.Boolean) {
          if (!_.isUndefined(value)) {
            if (typeof value === 'string') {
              value = value.toLowerCase() === 'true';
            } else {
              value = Boolean(value);
            }
          }
        }

        if (queryParam.type == DataType.Array) {
          if (!_.isUndefined(value) && !Array.isArray(value)) {
            if (typeof value === 'string') {
              const trimmed = value.trim();
              if (trimmed === '') {
                value = [];
              } else if (trimmed.startsWith('[')) {
                const parsed = parseSerializedValue<unknown[]>(trimmed, [value]);
                value = Array.isArray(parsed) ? parsed : [value];
              } else {
                value = [value];
              }
            } else {
              value = value !== null && value !== '' ? [value] : [];
            }
          }
        }

        if (queryParam.type == DataType.Object && !_.isUndefined(value)) {
          value = parseObjectParamValue(queryParamKey, value);
        }

        // Checked after templates have selected the final value, so neither direct
        // request values nor template-selected undeclared parameters can inject
        // query operators. Relation-filter queries apply a stricter check below.
        if (!literalParameters && queryParam.type != DataType.Object && isUnsafeParameterValue(value)) {
          throw new Error(`${queryParamKey} must be a literal value of the declared type`);
        }

        if (literalParameters && value != null) {
          const type = queryParam.type || DataType.String;
          const valid = type === DataType.String ? typeof value === 'string' :
            type === DataType.Number ? typeof value === 'number' && Number.isFinite(value) :
            type === DataType.Boolean ? typeof value === 'boolean' :
            type === DataType.Array ? Array.isArray(value) && value.every(primitive) :
            type === DataType.Date ? typeof value === 'string' ||
              (queryParam.format === NamedQueryFormatOptions.days && typeof value === 'number' && Number.isFinite(value)) : false;
          if (!valid) throw new Error('Relation parameters must be literal values of the declared type');
        }

        if (
          queryParam.type != DataType.Date &&
          queryParam.queryType !== undefined && !_.isEmpty(queryParam.queryType)
        ) {
          const query: Record<string, unknown> = {}
          if (value != undefined || (value == undefined && queryParam.whenUndefined != NamedQueryWhenUndefinedOptions.ignore)) {
            query[queryParam.queryType] = value;
            value = query;
          }
        }

        if (queryParam.type == DataType.Date) {
          if (queryParam.queryType !== undefined && !_.isEmpty(queryParam.queryType)) {
            const query: Record<string, unknown> = {};
            if (queryParam.format == NamedQueryFormatOptions.days && !_.isUndefined(value)) {
              let days = _.toInteger(value);
              let nowDateAddOrSubtract = DateTime.local();
              if (days > 0) {
                //Going forward in time X number of days
                nowDateAddOrSubtract = nowDateAddOrSubtract.plus({ days: days });
              } else if (days < 0) {
                //This "additional" step makes the code self explanatory
                days = days * -1;
                //Going backwards in time X number of days
                nowDateAddOrSubtract = nowDateAddOrSubtract.minus({ days: days });
              }
              value = nowDateAddOrSubtract.toISO();
            }

            query[queryParam.queryType] = value;
            value = query;
          }
        }

        if (value == undefined && queryParam.whenUndefined == NamedQueryWhenUndefinedOptions.ignore) {
          this.unsetIgnoredQueryParameter(mongoQuery, queryParam);
        } else {
          const existingValue = this.getMongoQueryValue(mongoQuery, queryParam.path)
          if (_.isPlainObject(existingValue) && _.isPlainObject(value)) {
            _.merge(value, existingValue);
          }
          this.setMongoQueryValue(mongoQuery, queryParam.path, value);
        }
      }
      return mongoQuery;
    }

    runTemplate(templateOrPath: string, variables: Record<string, unknown>, budget?: NamedQueryExecutionBudget): unknown {
      const templateVars = { ...variables };

      if (templateOrPath && templateOrPath.indexOf('{{') != -1) {
        try {
          if (budget) return renderNamedQueryPreviewTemplate(templateOrPath, templateVars, budget.remainingOutputBytes());
          const compiledTemplate = handlebarsCompile(templateOrPath, { noEscape: true });
          return compiledTemplate(templateVars);
        } catch (err) {
          if (budget && (err instanceof NamedQueryPreviewOutputLimitError || err instanceof RangeError)) {
            budget.outputTruncated = true;
            return undefined;
          }
          this.updateChronicle({ namedQueryTemplateOutcome: 'failed' }, [err]);
          throw err;
        }
      }
      return _.get(templateVars, templateOrPath);
    }

    public async performNamedQueryFromConfig(config: unknown, paramMap: Record<string, unknown>, brand: BrandingModel, start: number, rows: number, user?: unknown, budget?: NamedQueryExecutionBudget) {
      if (namedQuerySource(config) === 'graphql') {
        // T05 supplies execution context and dispatch. Until then validate shape and
        // fail closed before any database executor or GraphQL resolver can run.
        assertNamedQueryDefinition(config);
        throw new GraphqlNamedQueryValidationError([
          graphqlDiagnostic('GRAPHQL_EXECUTION_UNAVAILABLE', 'definition', 'GraphQL named query execution is not available.'),
        ]);
      }
      requireDatabaseNamedQuery(config);
      this.updateChronicle({ namedQueryBrandId: brand.id, namedQueryParameterCount: _.size(paramMap) });
      const collectionName = _.get(config, 'collectionName', '') ?? '';
      const resultObjectMapping = _.get(config, 'resultObjectMapping', {}) ?? {};
      const mongoQuery = _.cloneDeep(_.get(config, 'mongoQuery', {}) ?? {});
      const queryParams = (_.get(config, 'queryParams', {}) ?? {}) as Record<string, QueryParameterDefinition>;
      const sort = _.cloneDeep(_.get(config, 'sort', []) ?? []);
      const expandRelations = _.get(config, 'expandRelations', false) as boolean;
      const relatedRecordFilters = _.cloneDeep(_.get(config, 'relatedRecordFilters', []) ?? []) as RelatedRecordFilter[];
      return await this.performNamedQuery('', resultObjectMapping, collectionName, mongoQuery, queryParams, paramMap, brand, start, rows, user, sort, expandRelations, relatedRecordFilters, budget);
    }

    public async performNamedQueryFromConfigResults(config: unknown, paramMap: Record<string, string>, brand: BrandingModel, queryName: string, start: number = 0, rows: number = 30, maxRecords: number = 100, user: unknown = undefined) {
      requireDatabaseNamedQuery(config);
      const records = [];
      let requestCount = 0;
      this.updateChronicle({ namedQueryName: queryName, namedQueryMaxRecords: maxRecords });

      while (true) {
        // Keep going while there are more results.

        const response = await this.performNamedQueryFromConfig(config, paramMap, brand, start, rows, user);
        requestCount += 1;

        if (!response) {
          // stop if there is no response
          this.updateChronicle({ namedQueryOutcome: 'invalid-response' }, [], 'warn');
          break;
        }

        // add the new records to the collected records
        this.updateChronicle({ namedQueryPageResultCount: response.records.length });
        for (const record of response.records) {
          records.push(record);
        }

        const currentRetrievedCount = start + rows;
        if (response.summary.numFound <= currentRetrievedCount) {
          // stop if the total count is less than or equal to the number of records retrieved so far
          this.updateChronicle({ namedQueryOutcome: 'complete' });
          break;
        }

        // update the start point
        start = currentRetrievedCount;

        // Check the number of records and stop if it exceeds maxRecords.
        if (records.length > maxRecords) {
          this.updateChronicle({ namedQueryOutcome: 'limit-reached' }, [], 'warn');
          break;
        }

        // continue the while loop
      }

      this.updateChronicle({ namedQueryResultCount: records.length, namedQueryRequestCount: requestCount });
      return records;
    }
  }
}

enum DataType {
  Date = 'date',
  Number = 'number',
  String = 'string',
  Boolean = 'boolean',
  Array = 'array',
  Object = 'object',
}

enum NamedQueryWhenUndefinedOptions {
  defaultValue = 'defaultValue',
  ignore = "ignore"
}

enum NamedQueryFormatOptions {
  days = 'days',
  ISODate = 'ISODate'
}

type NamedQuerySortConfig = Record<string, "ASC" | "DESC">[];

type QueryParameterDefinition = NamedQueryParam;

export class RelatedRecordFilter {
  rootRecordType?: string;
  relationId?: string;
  collectionName: string = '';
  mongoQuery: Record<string, unknown> = {};
  localField: string = '';
  foreignField: string = '';
}

type NamedQueryConfigInput = Omit<Partial<NamedQueryAttributes>, 'branding' | 'queryParams' | 'mongoQuery' | 'resultObjectMapping' | 'sort' | 'expandRelations' | 'relatedRecordFilters' | 'graphql'> & {
  branding?: unknown;
  graphql?: unknown;
  metadata?: unknown;
  createdAt?: string;
  updatedAt?: string;
  sort?: unknown;
  expandRelations?: boolean | string;
  relatedRecordFilters?: unknown;
  queryParams?: unknown;
  mongoQuery?: unknown;
  resultObjectMapping?: unknown;
};

export class NamedQueryConfig implements DatabaseNamedQueryDefinition {
  source?: 'database';
  description?: string;
  name: string;
  branding: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  key: string;
  queryParams: Record<string, QueryParameterDefinition>;
  mongoQuery: Record<string, unknown>;
  collectionName: string;
  resultObjectMapping: Record<string, string>;
  brandIdFieldPath: string;
  sort: NamedQuerySortConfig | undefined;
  expandRelations: boolean;
  relatedRecordFilters: RelatedRecordFilter[];

  constructor(values: NamedQueryConfigInput | null | undefined) {
    requireDatabaseNamedQuery({ source: values?.source ?? undefined });
    if (values?.source === 'database') this.source = 'database';
    if (values?.description != null) this.description = values.description;
    this.name = values?.name ?? '';
    this.branding = values?.branding != null ? String(values.branding) : '';
    this.metadata = values?.metadata;
    this.createdAt = values?.createdAt ?? '';
    this.updatedAt = values?.updatedAt ?? '';
    this.key = values?.key ?? '';
    this.queryParams = parseSerializedValue<Record<string, QueryParameterDefinition>>(values?.queryParams, {});
    this.mongoQuery = parseSerializedValue<Record<string, unknown>>(values?.mongoQuery, {});
    this.collectionName = values?.collectionName ?? '';
    this.resultObjectMapping = parseSerializedValue<Record<string, string>>(values?.resultObjectMapping, {});
    this.brandIdFieldPath = values?.brandIdFieldPath ?? '';
    this.sort = parseSerializedValue<NamedQuerySortConfig>(values?.sort, []);
    this.expandRelations = values?.expandRelations === true || values?.expandRelations === 'true';
    this.relatedRecordFilters = parseSerializedValue<RelatedRecordFilter[]>(values?.relatedRecordFilters, []);
  }
}

/** A schema-drifted GraphQL record is still readable; T04 validates before save/use. */
export class GraphqlNamedQueryConfig {
  readonly source = 'graphql';
  name: string;
  branding: string;
  key: string;
  description?: string;
  graphql: GraphqlNamedQueryOperation;
  constructor(values: NamedQueryConfigInput) {
    this.name = values.name ?? '';
    this.branding = values.branding != null ? String(values.branding) : '';
    this.key = values.key ?? '';
    if (values.description != null) this.description = values.description;
    // Keep the saved document editable without asking the current schema to accept it.
    this.graphql = parseSerializedValue<GraphqlNamedQueryOperation>(values.graphql, {
      document: '', variables: {}, resultPath: [],
    });
  }
}
export type ResolvedNamedQueryConfig = NamedQueryConfig | GraphqlNamedQueryConfig;
export function readNamedQueryConfig(values: NamedQueryConfigInput): ResolvedNamedQueryConfig {
  return namedQuerySource({ source: values.source ?? undefined }) === 'graphql'
    ? new GraphqlNamedQueryConfig(values) : new NamedQueryConfig(values);
}

export class NamedQueryResponseRecord {
  oid: string;
  title: string;
  metadata: NamedQueryResponseMetadata;
  lastSaveDate: string | Date | null;
  dateCreated: string | Date | null;

  constructor(values: { oid: string; title: string; metadata: NamedQueryResponseMetadata; lastSaveDate: string | Date | null; dateCreated: string | Date | null }) {
    this.oid = values.oid
    this.title = values.title
    this.metadata = values.metadata
    this.lastSaveDate = values.lastSaveDate
    this.dateCreated = values.dateCreated
  }
}

declare global {
  let NamedQueryService: Services.NamedQueryService;
}
