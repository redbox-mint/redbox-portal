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

import { Observable, map, mergeMap } from 'rxjs';
import {
  resolveRecordConcurrentModificationConfig,
  type RecordConcurrentModificationConfig,
  type RecordConcurrentModificationMode,
} from '@researchdatabox/sails-ng-common';
import { activeRecordDefinitions } from './RecordDefinitionRuntimeService';
import type { RecordTypeAttributes } from '../waterline-models/RecordType';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { RecordTypeModel } from '../model/storage/RecordTypeModel';
import { assertStorageConcurrencyCapabilityForMode, type StorageCapabilityProvider } from '../RecordStorageConcurrency';

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

    protected recordTypes: RecordTypeModel[] = [];
    private cacheBrandId?: string;
    private cacheExpiresAt = 0;
    private cacheGeneration = 0;

    public async bootstrap(defBrand: BrandingModel): Promise<RecordTypeModel[]> {
      let recordTypes: RecordTypeModel[] = (await RecordType.find({
        branding: defBrand.id,
      })) as unknown as RecordTypeModel[];
      recordTypes = await Promise.all(
        recordTypes
          .filter(row => {
            const identity = row as object as RecordTypeAttributes;
            return !(
              (identity.draftId != null || (identity.version ?? 0) > 0) &&
              identity.activeRevisionId == null &&
              identity.activeRevisionNumber == null
            );
          })
          .map(row => activeRecordDefinitions().project(row as object as RecordTypeAttributes))
      );
      sails.log.verbose('Default recordTypes definition(s) exist.');
      sails.log.verbose(JSON.stringify(recordTypes));
      this.rememberBootstrap(defBrand, recordTypes);
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
      const concurrentModification = resolveRecordConcurrentModificationConfig(config.concurrentModification);
      return super.getObservable(
        RecordType.create({
          name: name,
          branding: brand.id,
          packageType: config.packageType,
          searchCore: config.searchCore,
          searchFilters: config.searchFilters,
          hooks: config.hooks,
          actionPlan: config.actionPlan,
          automaticTransitions: config.automaticTransitions,
          transferResponsibility: config.transferResponsibility,
          relatedTo: config.relatedTo,
          searchable: config.searchable,
          dashboard: config.dashboard,
          recordValidation: config.recordValidation,
          concurrentModification,
        }).fetch()
      );
    }

    public get(brand: BrandingModel, name: string, fields: string[] | null = null): Observable<RecordTypeModel> {
      return super
        .getObservable<RecordTypeAttributes>(RecordType.findOne({ where: { branding: brand.id, name } }))
        .pipe(
          mergeMap(async row => {
            if (!row) return row as object as RecordTypeModel;
            if (row.branding != null && String(row.branding) !== brand.id)
              throw new Error('Record type brand does not match.');
            // Resolve using the full identity before applying a caller's field projection.
            return activeRecordDefinitions().project(row, fields);
          })
        );
    }

    public getAll(brand: BrandingModel, fields: string[] | null = null): Observable<RecordTypeModel[]> {
      return super.getObservable<RecordTypeAttributes[]>(RecordType.find({ where: { branding: brand.id } })).pipe(
        mergeMap(async rows => {
          const projected: RecordTypeModel[] = [];
          for (const row of rows) {
            if (row.branding != null && String(row.branding) !== brand.id)
              throw new Error('Record type brand does not match.');
            // A managed identity with only a draft is not a runtime record type.
            if (
              (row.draftId != null || (row.version ?? 0) > 0) &&
              row.activeRevisionId == null &&
              row.activeRevisionNumber == null
            )
              continue;
            projected.push(await activeRecordDefinitions().project(row, fields));
          }
          return projected;
        })
      );
    }

    private rememberBootstrap(brand: BrandingModel, types: RecordTypeModel[]): void {
      this.recordTypes = structuredClone(types);
      this.cacheBrandId = brand.id;
      this.cacheExpiresAt = performance.now() + 1_000;
      this.cacheGeneration = activeRecordDefinitions().cacheGeneration;
    }

    /** @deprecated Bootstrap-only snapshot. Runtime callers must use brand-scoped getAll(). */
    public getAllCache(brand?: BrandingModel): RecordTypeModel[] {
      if (
        !brand ||
        this.cacheGeneration !== activeRecordDefinitions().cacheGeneration ||
        performance.now() >= this.cacheExpiresAt ||
        brand.id !== this.cacheBrandId
      )
        return [];
      return structuredClone(this.recordTypes);
    }

    private configuredStorageService(): StorageCapabilityProvider | undefined {
      const serviceName = String((sails.config.storage as { serviceName?: string } | undefined)?.serviceName ?? '');
      return serviceName ? (sails.services?.[serviceName] as StorageCapabilityProvider | undefined) : undefined;
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
