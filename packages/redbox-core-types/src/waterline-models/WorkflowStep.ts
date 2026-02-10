/// <reference path="../sails.ts" />
import { Entity, Attr, BelongsTo, toWaterlineModelDef } from '../decorators';
import { FormAttributes } from './Form';

@Entity('workflowstep')
export class WorkflowStepClass {
  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('form')
  public form?: string | number;

  @Attr({ type: 'json', required: true })
  public config!: Record<string, unknown>;

  @Attr({ type: 'boolean', required: true })
  public starting!: boolean;

  @BelongsTo('recordType')
  public recordType?: string | number;

  @Attr({ type: 'boolean', defaultsTo: false })
  public hidden?: boolean;
}

// Export the Waterline model definition for runtime use
export const WorkflowStepWLDef = toWaterlineModelDef(WorkflowStepClass);

// Type interface for backwards compatibility
export interface WorkflowStepAttributes extends Sails.WaterlineAttributes {
  config: Record<string, unknown>;
  form?: string | number | FormAttributes;
  hidden?: boolean;
  name: string;
  recordType?: string | number;
  starting: boolean;
}

export interface WorkflowStepWaterlineModel extends Sails.Model<WorkflowStepAttributes> {
  attributes: WorkflowStepAttributes;
}

declare global {
  const WorkflowStep: WorkflowStepWaterlineModel;
}
