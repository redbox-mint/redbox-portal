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

import { Observable, firstValueFrom, map } from 'rxjs';
import {
  resolveRecordConcurrentModificationConfig,
  type RecordConcurrentModificationConfig,
  type RecordConcurrentModificationMode,
} from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { RecordTypeModel } from '../model/storage/RecordTypeModel';
import { assertStorageConcurrencyCapabilityForMode, type StorageCapabilityProvider } from '../RecordStorageConcurrency';
import {
  isRecordSchemaEnabled,
  validateRecordTypeRecordSchemaConfig,
  type RecordSchemaConfigurationProblem,
} from '../config/recordSchema.config';

export class RecordTypeRecordSchemaConfigurationError extends TypeError {
  public readonly problems: readonly RecordSchemaConfigurationProblem[];

  public constructor(problems: readonly RecordSchemaConfigurationProblem[]) {
    const first = problems[0];
    super(
      first
        ? `Invalid record-type record schema configuration at ${first.path}: ${first.reason}.`
        : 'Invalid record-type record schema configuration.'
    );
    this.name = 'RecordTypeRecordSchemaConfigurationError';
    this.problems = Object.freeze([...problems]);
  }
}

export namespace Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class RecordTypes extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'bootstrap',
      'create',
      'get',
      'getAll',
      'getAllCache',
      'assertConcurrentModificationCapability',
      'resolveConcurrentModificationMode',
      'resolveConcurrentModificationPolicy',
    ];

    protected recordTypes!: RecordTypeModel[];

    public async bootstrap(defBrand: BrandingModel): Promise<RecordTypeModel[]> {
      let recordTypes: RecordTypeModel[] = (await RecordType.find({
        branding: defBrand.id,
      })) as unknown as RecordTypeModel[];
      if (sails.config.appmode.bootstrapAlways) {
        await RecordType.destroy({ branding: defBrand.id });
        recordTypes = [];
      }
      if (_.isUndefined(recordTypes)) {
        recordTypes = [];
      }
      sails.log.debug(
        `RecordTypes found: ${recordTypes} and boostrapAlways set to: ${sails.config.appmode.bootstrapAlways}`
      );
      if (_.isEmpty(recordTypes)) {
        // var rTypesObs = [];
        sails.log.verbose('Bootstrapping record type definitions... ');
        // _.forOwn(sails.config.recordtype, (config, recordType) => {
        //   recordTypes.push(recordType);
        //   var obs = this.create(defBrand, recordType, config);
        //   rTypesObs.push(obs);
        // });

        const configuredRecordTypes: Array<readonly [string, RecordTypeModel]> = [];
        for (const recordType in sails.config.recordtype) {
          const config: RecordTypeModel = sails.config.recordtype[recordType] as unknown as RecordTypeModel;
          configuredRecordTypes.push([recordType, config]);
        }
        for (const [recordType, config] of configuredRecordTypes) {
          this.assertRecordSchemaConfig(recordType, config.recordSchema);
        }
        const rTypes = [];
        for (const [recordType, config] of configuredRecordTypes) {
          rTypes.push(await firstValueFrom(this.create(defBrand, recordType, config)));
        }
        this.recordTypes = rTypes;
        this.assertStrictStorageCapabilities(rTypes);
        return rTypes;
      }
      sails.log.verbose('Default recordTypes definition(s) exist.');
      this.assertRecordSchemaConfigs(recordTypes);
      sails.log.verbose(JSON.stringify(recordTypes));
      this.recordTypes = recordTypes;
      this.assertStrictStorageCapabilities(recordTypes);
      return recordTypes;
    }

    /**
     * Persist a record type from configuration.  Concurrency policy is
     * normalized here, at the boundary where configuration enters storage, so
     * a malformed mode fails the lift instead of being discovered by the first
     * conditional write.
     */
    public create(
      brand: BrandingModel,
      name: string,
      config: RecordTypeModel & { dashboard?: unknown }
    ): Observable<RecordTypeModel> {
      this.assertRecordSchemaConfig(name, config.recordSchema);
      const concurrentModification = resolveRecordConcurrentModificationConfig(config.concurrentModification);
      return super.getObservable(
        RecordType.create({
          name: name,
          branding: brand.id,
          packageType: config.packageType,
          searchCore: config.searchCore,
          searchFilters: config.searchFilters,
          hooks: config.hooks,
          transferResponsibility: config.transferResponsibility,
          relatedTo: config.relatedTo,
          searchable: config.searchable,
          dashboard: config.dashboard,
          recordValidation: config.recordValidation,
          concurrentModification,
          recordSchema: config.recordSchema,
        }).fetch()
      );
    }

    public get(brand: BrandingModel, name: string, fields: string[] | null = null): Observable<RecordTypeModel> {
      const criteria: { where: { branding: string; name: string }; select?: string[] } = {
        where: { branding: brand.id, name: name },
      };
      if (fields) {
        criteria.select = fields;
      }
      return super.getObservable(RecordType.findOne(criteria));
    }

    public getAll(brand: BrandingModel, fields: string[] | null = null): Observable<RecordTypeModel[]> {
      const criteria: { where: { branding: string }; select?: string[] } = { where: { branding: brand.id } };
      if (fields) {
        criteria.select = fields;
      }
      return super.getObservable(RecordType.find(criteria));
    }

    public getAllCache(): RecordTypeModel[] {
      return this.recordTypes;
    }

    private configuredStorageService(): StorageCapabilityProvider | undefined {
      const serviceName = String((sails.config.storage as { serviceName?: string } | undefined)?.serviceName ?? '');
      return serviceName ? (sails.services?.[serviceName] as StorageCapabilityProvider | undefined) : undefined;
    }

    private assertRecordSchemaConfig(name: string, value: unknown): void {
      if (!isRecordSchemaEnabled(sails.config.recordSchema) || value === undefined) return;
      const pathName = /^[A-Za-z0-9_-]{1,100}$/.test(name) ? name : 'unknown';
      const problems = validateRecordTypeRecordSchemaConfig(value, `recordtype.${pathName}.recordSchema`);
      if (problems.length > 0) {
        throw new RecordTypeRecordSchemaConfigurationError(problems);
      }
    }

    private assertRecordSchemaConfigs(recordTypes: readonly RecordTypeModel[]): void {
      for (const [index, recordType] of recordTypes.entries()) {
        const runtimeRecordType: { readonly name?: unknown; readonly recordSchema?: unknown } = recordType;
        const name = typeof runtimeRecordType.name === 'string' ? runtimeRecordType.name : `index-${index}`;
        this.assertRecordSchemaConfig(name, runtimeRecordType.recordSchema);
      }
    }

    private assertStrictStorageCapabilities(recordTypes: RecordTypeModel[]): void {
      for (const recordType of recordTypes) {
        const policy = resolveRecordConcurrentModificationConfig(recordType.concurrentModification);
        this.assertConcurrentModificationCapability(policy.mode);
      }
    }

    /** Used both at startup and again when a mutation resolves current policy. */
    public assertConcurrentModificationCapability(mode: RecordConcurrentModificationMode): void {
      assertStorageConcurrencyCapabilityForMode(mode, this.configuredStorageService());
    }

    /**
     * Resolve concurrency policy from the authoritative stored record type.
     *
     * This reads storage on every call, so an administrator's policy change
     * applies to existing records the next time one of their requests resolves
     * policy.  Request bodies, headers, and save candidates never reach this
     * boundary, and an unresolvable or malformed policy fails closed rather
     * than silently degrading to last-write-wins.
     */
    public resolveConcurrentModificationPolicy(
      brand: BrandingModel,
      name: string
    ): Observable<RecordConcurrentModificationConfig> {
      return this.get(brand, name, ['concurrentModification']).pipe(
        map(recordType => {
          if (!recordType) {
            throw new Error(`Record type '${name}' could not be resolved for concurrency policy.`);
          }
          const policy = resolveRecordConcurrentModificationConfig(recordType.concurrentModification);
          this.assertConcurrentModificationCapability(policy.mode);
          return policy;
        })
      );
    }

    public resolveConcurrentModificationMode(
      brand: BrandingModel,
      name: string
    ): Observable<RecordConcurrentModificationMode> {
      return this.resolveConcurrentModificationPolicy(brand, name).pipe(map(policy => policy.mode));
    }
  }
}

declare global {
  let RecordTypesService: Services.RecordTypes;
}
