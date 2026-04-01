/// <reference path="../sails.ts" />
import { Entity, Attr, toWaterlineModelDef } from '../decorators';

@Entity('workspaceasync')
export class WorkspaceAsyncClass {
  @Attr({ type: 'string', required: true })
  public name!: string;

  @Attr({ type: 'string', required: true })
  public recordType!: string;

  @Attr({ type: 'string', columnType: 'datetime' })
  public date_started?: string;

  @Attr({ type: 'string', columnType: 'datetime' })
  public date_completed?: string;

  @Attr({ type: 'string', required: true })
  public started_by!: string;

  @Attr({ type: 'string', required: true })
  public service!: string;

  @Attr({ type: 'string', required: true })
  public method!: string;

  @Attr({ type: 'json', required: true })
  public args!: unknown;

  @Attr({ type: 'string' })
  public status?: string;

  @Attr({ type: 'json' })
  public message?: Record<string, unknown>;
}

// Export the Waterline model definition for runtime use
export const WorkspaceAsyncWLDef = toWaterlineModelDef(WorkspaceAsyncClass);

// Type interface for backwards compatibility
export interface WorkspaceAsyncAttributes extends Sails.WaterlineAttributes {
  args: unknown;
  date_completed?: string;
  date_started?: string;
  message?: Record<string, unknown>;
  method: string;
  name: string;
  recordType: string;
  service: string;
  started_by: string;
  status?: string;
}

export interface WorkspaceAsyncWaterlineModel extends Sails.Model<WorkspaceAsyncAttributes> {
  attributes: WorkspaceAsyncAttributes;
}

declare global {
  const WorkspaceAsync: WorkspaceAsyncWaterlineModel;
}
