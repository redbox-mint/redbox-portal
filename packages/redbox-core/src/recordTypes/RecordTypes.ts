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

import { Observable, defer, firstValueFrom, map } from 'rxjs';
import {
  resolveRecordConcurrentModificationConfig,
  type RecordConcurrentModificationConfig,
  type RecordConcurrentModificationMode,
} from '@researchdatabox/sails-ng-common';
import type { RecordTypeDefinition } from '../config/recordtype.config';
import type { RecordTypeRepository } from '../persistence/reference/ReferenceRepositories';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { RecordTypeModel } from '../model/storage/RecordTypeModel';
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

export type RecordTypeConfiguration =
  | (RecordTypeDefinition & { searchCore?: string })
  | (RecordTypeModel & { dashboard?: unknown });

export interface RecordTypesConfiguration {
  readonly appmode: { readonly bootstrapAlways?: boolean };
  readonly recordtype: Readonly<Record<string, RecordTypeConfiguration>>;
  readonly recordSchema?: unknown;
}

export interface RecordTypesDependencies {
  readonly repository: Pick<
    RecordTypeRepository,
    'listForBrand' | 'findByName' | 'createDefinition' | 'removeForBrand'
  >;
  readonly config: RecordTypesConfiguration;
  readonly log: { debug(message: string): void; verbose(message: string): void };
  readonly storageCapability: () => StorageCapabilityProvider | undefined;
}

/** Record-type operations shared by standalone composition and the temporary legacy adapter. */
export class RecordTypes {
  private initializing?: Promise<void>;

  public constructor(private readonly dependencies: RecordTypesDependencies) {}

  /** Explicit, joined startup; bootstrap remains available for deliberate reloads. */
  public initialize(brand: Pick<BrandingModel, 'id'>): Promise<void> {
    return (this.initializing ??= this.bootstrap(brand).then(() => {}));
  }

  public async close(): Promise<void> {
    this.recordTypes = undefined;
  }

  /** Same lazy, single-result/error semantics as CoreService's repository wrapper. */
  private observe<T>(operation: () => Promise<unknown>): Observable<T> {
    let pending: Promise<T> | undefined;
    return defer(() => (pending ??= Promise.resolve().then(operation) as Promise<T>));
  }

  protected recordTypes: RecordTypeModel[] | undefined;

  public async bootstrap(defBrand: Pick<BrandingModel, 'id'>): Promise<RecordTypeModel[]> {
    let recordTypes: RecordTypeModel[] = (await this.dependencies.repository.listForBrand(
      defBrand.id
    )) as unknown as RecordTypeModel[];
    if (this.dependencies.config.appmode.bootstrapAlways) {
      await this.dependencies.repository.removeForBrand(defBrand.id);
      recordTypes = [];
    }
    if (recordTypes === undefined) {
      recordTypes = [];
    }
    this.dependencies.log.debug(
      `RecordTypes found: ${recordTypes} and boostrapAlways set to: ${this.dependencies.config.appmode.bootstrapAlways}`
    );
    if (recordTypes.length === 0) {
      const configuredRecordTypes: Array<readonly [string, RecordTypeConfiguration]> = [];
      for (const recordType in this.dependencies.config.recordtype) {
        const config = this.dependencies.config.recordtype[recordType];
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
    this.dependencies.log.verbose('Default recordTypes definition(s) exist.');
    this.assertRecordSchemaConfigs(recordTypes);
    this.dependencies.log.verbose(JSON.stringify(recordTypes));
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
    brand: Pick<BrandingModel, 'id'>,
    name: string,
    config: RecordTypeConfiguration
  ): Observable<RecordTypeModel> {
    this.assertRecordSchemaConfig(name, config.recordSchema);
    const concurrentModification = resolveRecordConcurrentModificationConfig(config.concurrentModification);
    return this.observe(() =>
      this.dependencies.repository.createDefinition({
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
      })
    );
  }

  public get(
    brand: Pick<BrandingModel, 'id'>,
    name: string,
    fields: string[] | null = null
  ): Observable<RecordTypeModel> {
    return this.observe(() => this.dependencies.repository.findByName(brand.id, name, fields));
  }

  public getAll(brand: Pick<BrandingModel, 'id'>, fields: string[] | null = null): Observable<RecordTypeModel[]> {
    return this.observe(() => this.dependencies.repository.listForBrand(brand.id, fields));
  }

  public getAllCache(): RecordTypeModel[] | undefined {
    return this.recordTypes;
  }

  private assertRecordSchemaConfig(name: string, value: unknown): void {
    if (!isRecordSchemaEnabled(this.dependencies.config.recordSchema) || value === undefined) return;
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
      // Prisma's optional JSON decoder represents an absent stored override as null,
      // as does the record-validation boundary. Explicit config still validates above.
      this.assertRecordSchemaConfig(name, runtimeRecordType.recordSchema ?? undefined);
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
    assertStorageConcurrencyCapabilityForMode(mode, this.dependencies.storageCapability());
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
    brand: Pick<BrandingModel, 'id'>,
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
    brand: Pick<BrandingModel, 'id'>,
    name: string
  ): Observable<RecordConcurrentModificationMode> {
    return this.resolveConcurrentModificationPolicy(brand, name).pipe(map(policy => policy.mode));
  }
}
