/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';
import type { SavedGridDefinition, SavedGridRow } from '../services/SavedGridService';

@Entity('savedgrid')
export class SavedGridClass {
  @Attr({ type: 'string', required: true })
  public brandId!: string;
  @Attr({ type: 'string', required: true })
  public portal!: string;
  @Attr({ type: 'json', required: true })
  public definition!: SavedGridDefinition;
  @Attr({ type: 'number', required: true, min: 1, isInteger: true })
  public revision!: number;
}
export const SavedGridWLDef = toWaterlineModelDef(SavedGridClass);

declare global {
  const SavedGrid: Sails.Model<SavedGridRow>;
}
