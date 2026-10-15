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

import { BrandingModel } from '../model/storage/BrandingModel';
import { AppConfigAttributes } from '../waterline-models/AppConfig';
import { Services as services } from '../CoreService';
import { ConfigModels, type ConfigModelInfo, type ConfigModelFormAdapter } from '../configmodels/ConfigModels';
import type { BrandingConfigurationDefaultsConfig } from '../config/brandingConfigurationDefaults.config';
import { RESERVED_DASHBOARD_APP_CONFIG_KEYS } from './DashboardConfigService';
import type { AuthorizedDomainsEmails } from '../configmodels/AuthorizedDomainsEmails';
import * as TJS from "typescript-json-schema";
import { globSync } from 'glob';
import { AppConfigSecrets, isAppConfigSecretReference } from './AppConfigSecrets';
import { appConfigSecrets } from '../config/appConfigSecrets.config';

export const APP_CONFIG_SECRET_MASK = '__REDACTED__'
export const APP_CONFIG_SECRET_CLEAR = '__CLEAR_SECRET__';

type AppConfigData = Record<string, unknown>;
type AppConfigRecordLike = AppConfigAttributes & Record<string, unknown>;
const APP_CONFIG_PRESENT_KEYS_SYMBOL = Symbol.for('redbox.appConfig.presentKeys');

export namespace Services {
  /**
   * AppConfig related functions...
   *
   * 
   */
  export class AppConfigs extends services.Core.Service {
    brandingAppConfigMap: Record<string, BrandingConfigurationDefaultsConfig & { authorizedDomainsEmails?: AuthorizedDomainsEmails }> = {};
    modelSchemaMap: Record<string, unknown> = {};
    private extraTsGlobs: Set<string> = new Set();
    private secretStore?: AppConfigSecrets;
    private configWriteGates = new Map<string, Promise<void>>();

    protected override _exportedMethods: string[] = [
      'bootstrap',
      'getAllConfigurationForBrand',
      'loadAppConfigurationModel',
      'getAppConfigurationForBrand',
      'getMaskedAppConfigurationForBrand',
      'createOrUpdateConfig',
      'getAppConfigForm',
      'getAppConfigByBrandAndKey',
      'createConfig',
      'registerConfigModel'
    ];


    public bootstrap = (): Promise<void> => {
      this.brandingAppConfigMap = {}
      return this.bootstrapAsync();
    }

    private async bootstrapAsync() {
      // Caching the form schemas is for performance 
      // and we shouldn't wait for them to lift the app
      this.initAllConfigFormSchemas().then(() => {
        sails.log.info("Config Form Schemas Loaded");
      })
      const availableBrandings = BrandingService.getAvailable();
      for (const availableBranding of availableBrandings) {
        const branding: BrandingModel = BrandingService.getBrand(availableBranding);
        const appConfigObject = await this.loadAppConfigurationModel(branding.id);
        this.brandingAppConfigMap[availableBranding] = appConfigObject as BrandingConfigurationDefaultsConfig & { authorizedDomainsEmails?: AuthorizedDomainsEmails };
      }

    }

    async initAllConfigFormSchemas(): Promise<void> {
      const configKeys: string[] = ConfigModels.getConfigKeys();

      // First pass: collect all TS globs before generating any schemas
      for (const configKey of configKeys) {
        const modelDefinition: ConfigModelInfo | undefined = ConfigModels.getModelInfo(configKey);
        if (modelDefinition?.tsGlob) {
          const globs = Array.isArray(modelDefinition.tsGlob) ? modelDefinition.tsGlob : [modelDefinition.tsGlob];
          globs.filter(Boolean).forEach((g: string) => this.extraTsGlobs.add(g));
        }
      }

      // Second pass: generate schemas (now all globs are available)
      for (const configKey of configKeys) {
        const modelDefinition: ConfigModelInfo | undefined = ConfigModels.getModelInfo(configKey);
        // Init schema and put it in the cache
        if (modelDefinition) {
          this.getJsonSchema(modelDefinition);
        }
      }
    }

    private prepareBrandingCache(branding: BrandingModel, configKey: string, hydrated: AppConfigData, fallback?: BrandingConfigurationDefaultsConfig): BrandingConfigurationDefaultsConfig & { authorizedDomainsEmails?: AuthorizedDomainsEmails } {
      const current = this.brandingAppConfigMap[branding.name] ?? fallback;
      const next: Record<string, unknown> = { ...(current ?? this.createDefaultConfiguration()) };
      next[configKey] = hydrated;
      const presentKeys: Set<string> = Reflect.get(current ?? {}, APP_CONFIG_PRESENT_KEYS_SYMBOL) ?? new Set<string>();
      Object.defineProperty(next, APP_CONFIG_PRESENT_KEYS_SYMBOL, {
        value: new Set([...presentKeys, configKey]), enumerable: false, configurable: true
      });
      return next as unknown as BrandingConfigurationDefaultsConfig & { authorizedDomainsEmails?: AuthorizedDomainsEmails };
    }

    /** Expand only own properties; wildcard matches one literal key, including punctuation. */
    private getSecretPaths(configKey: string, data: unknown, forWrite = false): string[][] {
      const paths: string[][] = [];
      const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
      const visit = (value: unknown, parts: string[], path: string[]) => {
        if (parts.length === 0) { paths.push(path); return; }
        if (typeof value !== 'object' || value === null) return;
        const [part, ...rest] = parts;
        const keys = part === '*' ? Object.keys(value) : [part];
        for (const key of keys) {
          if (forWrite && unsafe.has(key)) throw new Error('Unsafe AppConfig secret field key');
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            visit(Reflect.get(value, key), rest, [...path, key]);
          }
        }
      };
      for (const field of this.getSecretFields(configKey)) visit(data, field.split('.'), []);
      return paths;
    }

    private setExistingSecretPath(data: object, path: string[], value: unknown): void {
      let parent: object = data;
      for (const key of path.slice(0, -1)) {
        if (!Object.prototype.hasOwnProperty.call(parent, key)) return;
        const next: unknown = Reflect.get(parent, key);
        if (typeof next !== 'object' || next === null) return;
        parent = next;
      }
      const key = path[path.length - 1];
      if (key !== undefined && Object.prototype.hasOwnProperty.call(parent, key)) {
        Object.defineProperty(parent, key, { value, writable: true, enumerable: true, configurable: true });
      }
    }

    private getSecretFields(configKey: string): string[] {
      return ConfigModels.getModelInfo(configKey)?.secretFields ?? [];
    }

    private getSecretStore(): AppConfigSecrets {
      return this.secretStore ??= new AppConfigSecrets({ ...appConfigSecrets, ...sails.config.appConfigSecrets });
    }

    private async hydrateSecretFields(configKey: string, configData: AppConfigData | undefined): Promise<AppConfigData | undefined> {
      if (configData == null) return configData;
      const hydrated = _.cloneDeep(configData);
      for (const field of this.getSecretPaths(configKey, hydrated)) {
        const value: unknown = _.get(hydrated, field);
        if (isAppConfigSecretReference(value)) {
          this.setExistingSecretPath(hydrated, field, await this.getSecretStore().resolve(value));
        }
      }
      return hydrated;
    }

    private async storeSecretFields(brandId: string, configKey: string, incoming: AppConfigData, existing?: unknown): Promise<AppConfigData> {
      const provider = sails.config.appConfigSecrets?.provider ?? 'database';
      if (provider !== 'database' && provider !== 'aws-secrets-manager') {
        throw new Error('Unsupported appConfigSecrets.provider');
      }
      const layout = sails.config.appConfigSecrets?.layout ?? 'per-field';
      if (layout !== 'per-field' && layout !== 'brand-json') throw new Error('Unsupported appConfigSecrets.layout');
      const bundle = provider === 'aws-secrets-manager' && layout === 'brand-json';
      const changes = new Map<string, string | null>();
      const bundledFields: Array<{ field: string[]; key: string }> = [];
      // References are backend-owned. Forms submit only values, masks, or clear markers.
      const incomingSecretPaths = this.getSecretPaths(configKey, incoming, true);
      const existingSecretPaths = this.getSecretPaths(configKey, existing);
      for (const field of incomingSecretPaths) {
        const value: unknown = _.get(incoming, field);
        if (value != null && typeof value !== 'string') {
          throw new Error(`AppConfig secret field '${field.join('.')}' must be a string`);
        }
      }
      const hasBundledReferences = existingSecretPaths.some(field => {
        const value: unknown = _.get(existing, field);
        return isAppConfigSecretReference(value) && value.$appConfigSecret.key !== undefined;
      });
      if ((bundle && (incomingSecretPaths.length > 0 || existingSecretPaths.length > 0)) || hasBundledReferences) {
        await this.getSecretStore().synchronizeBundle(brandId);
      }
      const stored = this.mergeSecretFields(configKey, incoming, existing) as AppConfigData;
      for (const field of this.getSecretPaths(configKey, stored, true)) {
        const value: unknown = _.get(stored, field);
        if (isAppConfigSecretReference(value)) {
          if (bundle && value.$appConfigSecret.key === undefined) {
            const key = JSON.stringify([configKey, ...field]);
            changes.set(key, await this.getSecretStore().resolve(value));
            bundledFields.push({ field, key });
          }
          continue;
        }
        if (!this.shouldMaskSecretValue(value)) continue;
        const previous: unknown = _.get(existing, field);
        // Bundled plaintext comparisons run under the distributed lease in
        // storeBundle, so a stale local value cannot suppress a requested change.
        if (isAppConfigSecretReference(previous) && !(bundle && previous.$appConfigSecret.key !== undefined)) {
          let previousValue: string | undefined;
          try {
            previousValue = await this.getSecretStore().resolve(previous);
          } catch (error) {
            // An explicit replacement can recover from a deleted/inaccessible old secret.
            // Database mode must never turn an AWS reference into plaintext.
            if (provider !== 'aws-secrets-manager') throw error;
          }
          if (value === previousValue && (!bundle || previous.$appConfigSecret.key !== undefined)) {
            _.set(stored, field, previous);
            continue;
          }
        }
        if (provider === 'aws-secrets-manager') {
          if (bundle) {
            const key = JSON.stringify([configKey, ...field]);
            changes.set(key, String(value));
            bundledFields.push({ field, key });
          } else {
            _.set(stored, field, await this.getSecretStore().store(brandId, configKey, JSON.stringify(field), String(value)));
          }
        } else if (isAppConfigSecretReference(_.get(existing, field))) {
          throw new Error('Enable AWS Secrets Manager to replace an externally stored AppConfig secret');
        }
      }
      if (bundle) {
        // Remove cleared/omitted bundled fields without rewriting any other configuration key.
        for (const field of this.getSecretPaths(configKey, existing)) {
          const previous: unknown = _.get(existing, field);
          if (isAppConfigSecretReference(previous) && previous.$appConfigSecret.key !== undefined && !this.shouldMaskSecretValue(_.get(stored, field))) {
            changes.set(previous.$appConfigSecret.key, null);
          }
        }
        if (changes.size > 0) {
          const arn = await this.getSecretStore().storeBundle(brandId, changes);
          if (bundledFields.length > 0 && !arn) throw new Error('AWS Secrets Manager did not return a bundle ARN');
          for (const { field, key } of bundledFields) {
            _.set(stored, field, { $appConfigSecret: { provider: 'aws-secrets-manager', arn: arn!, key } });
          }
        }
      }
      return stored;
    }

    private isMaskedSecretPlaceholder(value: unknown): boolean {
      return typeof value === 'string' && value === APP_CONFIG_SECRET_MASK;
    }

    private shouldMaskSecretValue(value: unknown): boolean {
      if (typeof value === 'string') {
        return value.trim() !== '';
      }
      return value != null;
    }

    private maskSecretFields<T>(configKey: string, configData: T): T {
      const secretFields = this.getSecretFields(configKey);
      if (secretFields.length === 0 || configData == null) {
        return configData;
      }
      const masked = _.cloneDeep(configData);
      this.getSecretPaths(configKey, masked).forEach((fieldPath: string[]) => {
        if (_.has(masked, fieldPath) && this.shouldMaskSecretValue(_.get(masked, fieldPath))) {
          this.setExistingSecretPath(masked as object, fieldPath, APP_CONFIG_SECRET_MASK);
        }
      });
      return masked;
    }



    private mergeSecretFields(configKey: string, incomingConfig: unknown, existingConfig?: unknown): unknown {
      const secretFields = this.getSecretFields(configKey);
      if (secretFields.length === 0 || incomingConfig == null) {
        return incomingConfig;
      }

      const merged = _.cloneDeep(incomingConfig);
      this.getSecretPaths(configKey, merged, true).forEach((fieldPath: string[]) => {
        const incomingValue = _.get(merged, fieldPath);
        if (this.isMaskedSecretPlaceholder(incomingValue)) {
          if (existingConfig != null && _.has(existingConfig, fieldPath)) {
            _.set(merged, fieldPath, _.get(existingConfig, fieldPath));
          } else {
            _.unset(merged, fieldPath);
          }
        } else if (incomingValue === APP_CONFIG_SECRET_CLEAR) {
          _.unset(merged, fieldPath);
        }
      });

      return merged;
    }

    private prepareConfigModelForForm(configKey: string, model: unknown): object {
      const formAdapter = ConfigModels.getModelInfo(configKey)?.formAdapter?.toForm;
      const transformed = typeof formAdapter === 'function'
        ? formAdapter(_.cloneDeep(model))
        : _.cloneDeep(model);
      return transformed as object;
    }

    private prepareConfigModelForSave(configKey: string, model: unknown): AppConfigData {
      const formAdapter = ConfigModels.getModelInfo(configKey)?.formAdapter?.fromForm;
      const transformed = typeof formAdapter === 'function'
        ? formAdapter(_.cloneDeep(model))
        : _.cloneDeep(model);
      return transformed as AppConfigData;
    }

    public getAppConfigurationForBrand(brandName: string): BrandingConfigurationDefaultsConfig & { authorizedDomainsEmails?: AuthorizedDomainsEmails } {
      return _.get(this.brandingAppConfigMap, brandName, sails.config.brandingConfigurationDefaults == undefined ? {} : sails.config.brandingConfigurationDefaults) as BrandingConfigurationDefaultsConfig & { authorizedDomainsEmails?: AuthorizedDomainsEmails };
    }

    /** Safe admin view; backend consumers continue to use the hydrated cache. */
    public getMaskedAppConfigurationForBrand(brandName: string, configKey?: string): unknown {
      const configuration = this.getAppConfigurationForBrand(brandName);
      const masked = _.cloneDeep(configuration) as unknown as Record<string, unknown>;
      for (const key of new Set([...ConfigModels.getConfigKeys(), ...Object.keys(masked)])) {
        if (_.has(masked, key)) _.set(masked, key, this.maskSecretFields(key, _.get(masked, key)));
      }
      return configKey ? _.get(masked, configKey, null) : masked;
    }

    public getAllConfigurationForBrand = (brandId: string): Promise<AppConfigAttributes[]> => {
      return AppConfig.find({ branding: brandId }) as unknown as Promise<AppConfigAttributes[]>;
    }

    private getConfigRecordTimestamp(record: AppConfigRecordLike | undefined): number {
      const updatedAt = Date.parse(String(record?.updatedAt ?? ''));
      if (!Number.isNaN(updatedAt)) {
        return updatedAt;
      }
      const createdAt = Date.parse(String(record?.createdAt ?? ''));
      if (!Number.isNaN(createdAt)) {
        return createdAt;
      }
      return 0;
    }

    private chooseLatestConfigRecord(records: AppConfigAttributes[]): AppConfigAttributes | undefined {
      return records.reduce<AppConfigAttributes | undefined>((latest, current) => {
        if (latest == null) {
          return current;
        }
        return this.getConfigRecordTimestamp(current as AppConfigRecordLike) >= this.getConfigRecordTimestamp(latest as AppConfigRecordLike)
          ? current
          : latest;
      }, undefined);
    }

    private reduceToLatestConfigRecords(records: AppConfigAttributes[]): AppConfigAttributes[] {
      const latestByKey = new Map<string, AppConfigAttributes>();

      for (const record of records) {
        const key = String(record.configKey ?? '');
        const currentLatest = latestByKey.get(key);
        if (currentLatest == null) {
          latestByKey.set(key, record);
          continue;
        }
        if (this.getConfigRecordTimestamp(record as AppConfigRecordLike) >= this.getConfigRecordTimestamp(currentLatest as AppConfigRecordLike)) {
          latestByKey.set(key, record);
        }
      }

      return Array.from(latestByKey.values());
    }

    private async findLatestConfigRecord(brandId: string, configKey: string): Promise<AppConfigAttributes | undefined> {
      const records = await (AppConfig.find({ branding: brandId, configKey }) as unknown as Promise<AppConfigAttributes[]>);
      if (records.length > 1) {
        sails.log.warn(`Multiple appconfig records found for branding '${brandId}' and key '${configKey}'. Using the most recently updated record.`);
      }
      return this.chooseLatestConfigRecord(records);
    }

    private createDefaultConfiguration(): Record<string, unknown> {
      const appConfiguration: Record<string, unknown> = {};
      const modelNames = ConfigModels.getConfigKeys();
      for (const modelName of modelNames) {
        const modelInfo = ConfigModels.getModelInfo(modelName);
        if (!modelInfo) {
          continue;
        }
        const modelClass = modelInfo.class;
        const defaultModel = new modelClass();
        _.set(appConfiguration, modelName, defaultModel);
      }

      // grab any default branding configuration we're overriding in config
      _.merge(appConfiguration, sails.config.brandingConfigurationDefaults);


      return appConfiguration;
    }

    public async loadAppConfigurationModel(brandId: string): Promise<BrandingConfigurationDefaultsConfig & { authorizedDomainsEmails?: AuthorizedDomainsEmails }> {
      const appConfiguration = this.createDefaultConfiguration();
      const appConfigItems: AppConfigAttributes[] = await this.getAllConfigurationForBrand(brandId);
      const latestAppConfigItems = this.reduceToLatestConfigRecords(appConfigItems).filter(item => {
        if (this.isSafeConfigKey(item.configKey)) return true;
        sails.log.warn(`Skipping legacy AppConfig row with an unsafe configuration key for branding '${brandId}'. Review hook filenames and migrate the row explicitly.`);
        return false;
      });
      if (this.reduceToLatestConfigRecords(appConfigItems).length !== appConfigItems.length) {
        sails.log.warn(`Duplicate appconfig records detected for branding '${brandId}'. Using the most recently updated record for each config key.`);
      }
      // An explicit reload refreshes each distinct ARN once; all fields in a brand
      // bundle share that request. Routine reads and saves reuse the resolved values.
      const references = new Set<string>();
      let hasBundledReferences = false;
      for (const item of latestAppConfigItems) {
        for (const field of this.getSecretPaths(item.configKey, item.configData)) {
          const value: unknown = _.get(item.configData, field);
          if (isAppConfigSecretReference(value)) {
            references.add(value.$appConfigSecret.arn);
            hasBundledReferences ||= value.$appConfigSecret.key !== undefined;
          }
        }
      }
      for (const arn of references) this.secretStore?.invalidate(arn);
      if (hasBundledReferences) await this.getSecretStore().synchronizeBundle(brandId, 'load');
      for (const appConfigItem of latestAppConfigItems) {
        _.set(appConfiguration, appConfigItem.configKey, await this.hydrateSecretFields(appConfigItem.configKey, appConfigItem.configData));
      }
      Object.defineProperty(appConfiguration, APP_CONFIG_PRESENT_KEYS_SYMBOL, {
        value: new Set(latestAppConfigItems.map(item => item.configKey)),
        enumerable: false,
        configurable: true
      });
      return appConfiguration as unknown as BrandingConfigurationDefaultsConfig & { authorizedDomainsEmails?: AuthorizedDomainsEmails };
    }

    public async getAppConfigByBrandAndKey(brandId: string, configKey: string): Promise<unknown> {
      this.assertSafeConfigKey(configKey);
      const dbConfig = await this.findLatestConfigRecord(brandId, configKey);

      // If no config exists in the DB return the default settings
      if (dbConfig != null) {
        return this.maskSecretFields(configKey, dbConfig.configData);
      }

      let config = _.get(sails.config.brandingConfigurationDefaults, configKey, {});
      if (_.isEmpty(config)) {
        const modelInfo: ConfigModelInfo | undefined = ConfigModels.getModelInfo(configKey);
        if (modelInfo == null) {
          throw Error(`No config found for config key ${configKey}`);
        }
        const modelClass = modelInfo.class;
        config = new modelClass();
      }
      return this.maskSecretFields(configKey, config);
    }

    /**
     * Retired dashboard keys cannot be written through generic configuration
     * operations: independent dashboard settings are revision-checked and live in
     * the DashboardConfiguration model. The migration reads legacy rows directly.
     */
    private isSafeConfigKey(configKey: string): boolean {
      return typeof configKey === 'string' && configKey.length > 0 &&
        !/[.[\]]/.test(configKey) && !['__proto__', 'prototype', 'constructor'].includes(configKey);
    }

    private assertSafeConfigKey(configKey: string): void {
      if (!this.isSafeConfigKey(configKey)) throw new Error('AppConfig key must be a single safe configuration name');
    }

    private assertWritableConfigKey(configKey: string): void {
      this.assertSafeConfigKey(configKey);
      if (RESERVED_DASHBOARD_APP_CONFIG_KEYS.includes(configKey)) {
        const error = new Error(`Config key "${configKey}" is retired. Dashboard settings are managed through the dashboard configuration editor or /api/dashboard-config.`) as Error & { status: number; code: string };
        error.status = 410;
        error.code = 'legacy-operation-retired';
        throw error;
      }
    }

    /** Order persistence/cache publication per key, or per brand for shared JSON bundles. */
    private async withConfigWriteLock<T>(brandId: string, configKey: string, write: () => Promise<T>): Promise<T> {
      const bundle = sails.config.appConfigSecrets?.provider === 'aws-secrets-manager' && sails.config.appConfigSecrets.layout === 'brand-json';
      const key = JSON.stringify([brandId, bundle ? null : configKey]);
      const previous = this.configWriteGates.get(key) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      this.configWriteGates.set(key, gate);
      await previous;
      try {
        return await write();
      } finally {
        release();
        if (this.configWriteGates.get(key) === gate) this.configWriteGates.delete(key);
      }
    }

    public async createOrUpdateConfig(branding: BrandingModel, configKey: string, configData: AppConfigData): Promise<unknown> {
      this.assertWritableConfigKey(configKey);
      return this.withConfigWriteLock(String(branding.id), configKey, async () => {
        const dbConfig = await this.findLatestConfigRecord(String(branding.id), configKey);
        const preparedConfigData = this.prepareConfigModelForSave(configKey, configData);
        const mergedConfigData = await this.storeSecretFields(String(branding.id), configKey, preparedConfigData, dbConfig?.configData ?? _.get(this.createDefaultConfiguration(), [configKey]));

        const hydrated = await this.hydrateSecretFields(configKey, mergedConfigData);
        const nextCache = this.prepareBrandingCache(branding, configKey, hydrated!);
        // Hydrate and prepare defaults before persistence; cache publication needs no AWS reads.
        let record;
        if (dbConfig == null) {
          record = await AppConfig.create({ branding: branding.id, configKey: configKey, configData: mergedConfigData });
        } else {
          record = await AppConfig.updateOne({ branding: branding.id, configKey }).set({ configData: mergedConfigData });
        }

        // Rebase on the current cache in case a different key was saved while the DB write awaited.
        this.brandingAppConfigMap[branding.name] = this.prepareBrandingCache(branding, configKey, hydrated!, nextCache);
        return this.maskSecretFields(configKey, (record as unknown as AppConfigAttributes).configData);
      });
    }

    public async createConfig(brandName: string, configKey: string, configData: AppConfigData): Promise<unknown> {
      this.assertWritableConfigKey(configKey);
      const branding: BrandingModel = BrandingService.getBrand(brandName);
      return this.withConfigWriteLock(String(branding.id), configKey, async () => {
        const dbConfig = await this.findLatestConfigRecord(String(branding.id), configKey);
        const preparedConfigData = this.prepareConfigModelForSave(configKey, configData);

        // Create if no config exists
        if (dbConfig == null) {
          const stored = await this.storeSecretFields(String(branding.id), configKey, preparedConfigData, _.get(this.createDefaultConfiguration(), [configKey]));
          const hydrated = await this.hydrateSecretFields(configKey, stored);
          const nextCache = this.prepareBrandingCache(branding, configKey, hydrated!);
          const createdRecord = await AppConfig.create({ branding: branding.id, configKey, configData: stored });
          this.brandingAppConfigMap[branding.name] = this.prepareBrandingCache(branding, configKey, hydrated!, nextCache);
          return this.maskSecretFields(configKey, (createdRecord as unknown as AppConfigAttributes).configData);
        }

        throw Error(`Config with key ${configKey} for branding ${brandName} already exists`);
      });
    }

    public async getAppConfigForm(branding: BrandingModel, configForm: string): Promise<{ model: object; schema: unknown; fieldOrder: string[] }> {

      const appConfig = this.getAppConfigurationForBrand(branding.name);

      const modelDefinition: ConfigModelInfo | undefined = ConfigModels.getModelInfo(configForm);
      if (!modelDefinition) {
        throw new Error(`Config model not found for form ${configForm}`);
      }
      const modelCtor = modelDefinition.class as { new(...args: never[]): object; getFieldOrder?: () => string[] };
      const model = _.get(appConfig, configForm, new modelCtor()) as object;
      const jsonSchema = this.getJsonSchema(modelDefinition);
      const fieldOrder = typeof modelCtor.getFieldOrder === 'function' ? modelCtor.getFieldOrder() : [];
      const preparedModel = this.prepareConfigModelForForm(configForm, model);
      const configData = { model: this.maskSecretFields(configForm, preparedModel), schema: jsonSchema, fieldOrder: fieldOrder };
      return configData;
    }

    private getJsonSchema(modelDefinition: ConfigModelInfo): unknown {
      // Check if schema is already cached
      if (this.modelSchemaMap[modelDefinition.modelName] != undefined) {
        return this.modelSchemaMap[modelDefinition.modelName];
      }

      if (modelDefinition.schema) {
        sails.log.verbose("A schema was provided for model, using it instead of generating it from the typescript model. Model name:", modelDefinition.modelName);
        this.modelSchemaMap[modelDefinition.modelName] = modelDefinition.schema;
        return modelDefinition.schema;
      }

      sails.log.verbose("No schema was provided for model, generating it from the typescript model. Model name:", modelDefinition.modelName);
      // const wildcardPath = `${sails.config.appPath}/typescript/api/configmodels/*.ts`;
      const extraGlobs = Array.from(this.extraTsGlobs.values());
      const filePaths = Array.from(new Set([
        // ...globSync(wildcardPath),
        ...extraGlobs.flatMap(g => globSync(g))
      ]));
      if (filePaths.length === 0) {
        sails.log.warn(`No source files found for schema generation for model ${modelDefinition.modelName}`);
      }
      const typeName = modelDefinition.modelName;

      const program = TJS.getProgramFromFiles(filePaths);
      const settings: TJS.PartialArgs = {
        // TODO: enabling the 'titles' setting seems to mean that
        //  the generated titles cannot be overridden.
        //  This is a problem when the generated title (field name) is not clear.
        //  Fixed for now by declaring titles for all the model fields and turning this setting off.
        // titles: true,
      };

      // Generate the schema and cache it
      const schema = TJS.generateSchema(program, typeName, settings);
      this.modelSchemaMap[modelDefinition.modelName] = schema;
      return schema;
    }

    /**
     * Public API for hooks/extensions to register additional config models.
     * - If a prebuilt JSON schema is provided, it will be cached and preferred.
     * - If a TS glob is provided, it will be used to find model types for schema generation.
     */
    public registerConfigModel(info: { key: string; modelName: string; class: { new(...args: never[]): object; getFieldOrder?: () => string[] }; schema?: unknown; tsGlob?: string | string[]; secretFields?: string[]; formAdapter?: ConfigModelFormAdapter }): void {
      // persist in ConfigModels registry
      ConfigModels.register(info.key, { modelName: info.modelName, class: info.class, schema: info.schema, tsGlob: info.tsGlob, secretFields: info.secretFields, formAdapter: info.formAdapter });
      // cache schema if provided
      if (info.schema) {
        this.modelSchemaMap[info.modelName] = info.schema;
      }
      // collect any extra TS globs
      if (info.tsGlob) {
        const globs = Array.isArray(info.tsGlob) ? info.tsGlob : [info.tsGlob];
        globs.filter(g => g && typeof g === 'string' && g.trim().length > 0).forEach(g => this.extraTsGlobs.add(g));
      }
      // ensure existing branding app configs get a default instance if not present
      if (this.brandingAppConfigMap) {
        try {
          const defaultInstance = new info.class();
          Object.keys(this.brandingAppConfigMap).forEach(brandName => {
            const brandConfig = this.brandingAppConfigMap[brandName] || {};
            if (_.get(brandConfig, info.key) === undefined) {
              _.set(brandConfig, info.key, defaultInstance);
            }
            this.brandingAppConfigMap[brandName] = brandConfig;
          });
        } catch (e: unknown) {
          const err = e instanceof Error ? e.message : String(e);
          sails.log.warn(`registerConfigModel: could not instantiate default for ${info.key}: ${err}`);
        }
      }
    }
  }

}

declare global {
  let AppConfigService: Services.AppConfigs;
}
