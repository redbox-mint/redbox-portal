/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { Entity, Attr, toWaterlineModelDef } from '../decorators';

@Entity('recordaudit', { datastore: 'redboxStorage' })
export class RecordAuditClass {
  @Attr({ type: 'json' })
  public user?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public record?: Record<string, unknown>;

  @Attr({ type: 'string', autoCreatedAt: true })
  public dateCreated!: string;

  @Attr({ type: 'string' })
  public action?: string;
}

// Export the Waterline model definition for runtime use
export const RecordAuditWLDef = toWaterlineModelDef(RecordAuditClass);

// Type interface for backwards compatibility
export interface RecordAuditAttributes extends Sails.WaterlineAttributes {
  action?: string;
  dateCreated?: string;
  record?: Record<string, unknown>;
  user?: Record<string, unknown>;
}

export interface RecordAuditWaterlineModel extends Sails.Model<RecordAuditAttributes> {
  attributes: RecordAuditAttributes;
}

declare global {
  var RecordAudit: RecordAuditWaterlineModel;
}
