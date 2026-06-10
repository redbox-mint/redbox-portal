/// <reference path="../sails.ts" />
import { Entity, Attr, toWaterlineModelDef } from '../decorators';

@Entity('migration')
export class MigrationClass {
  @Attr({ type: 'string', required: true, unique: true })
  public name!: string;

  @Attr({ type: 'string' })
  public source?: string;

  @Attr({ type: 'string' })
  public appVersion?: string;

  @Attr({ type: 'number', required: true })
  public ranAt!: number;

  @Attr({ type: 'number' })
  public durationMs?: number;

  @Attr({ type: 'string' })
  public executedBy?: string;
}

export const MigrationWLDef = toWaterlineModelDef(MigrationClass);

export interface MigrationAttributes extends Sails.WaterlineAttributes {
  name: string;
  source?: string;
  appVersion?: string;
  ranAt: number;
  durationMs?: number;
  executedBy?: string;
}

export interface MigrationWaterlineModel extends Sails.Model<MigrationAttributes> {
  attributes: MigrationAttributes;
}

declare global {
  const Migration: MigrationWaterlineModel;
}
