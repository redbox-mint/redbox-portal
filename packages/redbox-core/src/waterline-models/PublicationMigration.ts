/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';
import type { PublicationMigrationModel } from '../model/storage/PublicationMigrationModel';

/** Native migration store owns authority CAS, immutable evidence and indexes. */
@Entity('publicationmigration')
export class PublicationMigrationClass implements PublicationMigrationModel {
  @Attr({ type: 'number', required: true }) public schemaVersion!: 1;
  @Attr({ type: 'string', required: true }) public brandId!: string;
  @Attr({ type: 'string', required: true }) public migrationId!: string;
  @Attr({ type: 'number' }) public revision!: number;
  @Attr({ type: 'string' }) public authority!: PublicationMigrationModel['authority'];
  @Attr({ type: 'string' }) public phase!: PublicationMigrationModel['phase'];
  @Attr({ type: 'string' }) public inventoryFingerprint!: string;
  @Attr({ type: 'string' }) public configurationFingerprint!: string;
  @Attr({ type: 'string' }) public sourceFingerprint!: string;
  @Attr({ type: 'json' }) public assignments!: PublicationMigrationModel['assignments'];
  @Attr({ type: 'json' }) public usedDestinations!: PublicationMigrationModel['usedDestinations'];
  @Attr({ type: 'json' }) public verifiedTargets!: PublicationMigrationModel['verifiedTargets'];
  @Attr({ type: 'json' }) public counts!: PublicationMigrationModel['counts'];
  @Attr({ type: 'json' }) public globalFailures!: string[];
  @Attr({ type: 'json' }) public actor!: PublicationMigrationModel['actor'];
  @Attr({ type: 'string' }) public reason!: string;
  @Attr({ type: 'string' }) public settlementReference!: string;
  @Attr({ type: 'string' }) public startedAt!: string;
  @Attr({ type: 'string' }) public committedAt?: string;
  @Attr({ type: 'json' }) public history?: PublicationMigrationModel['history'];
}
export const PublicationMigrationWLDef = toWaterlineModelDef(PublicationMigrationClass);
