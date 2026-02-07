/// <reference path="../sails.ts" />
import { Entity, Attr, BelongsTo, toWaterlineModelDef } from '../decorators';

@Entity('form')
export class FormClass {
  @Attr({ type: 'string', required: true, unique: true })
  public name!: string;

  @Attr({ type: 'json' })
  public customAngularApp?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public fields?: Record<string, unknown>;

  @BelongsTo('workflowStep')
  public workflowStep?: string | number;

  @Attr({ type: 'string' })
  public type?: string;

  @Attr({ type: 'json' })
  public messages?: Record<string, unknown>;

  @Attr({ type: 'string' })
  public requiredFieldIndicator?: string;

  @Attr({ type: 'string' })
  public viewCssClasses?: string;

  @Attr({ type: 'string' })
  public editCssClasses?: string;

  @Attr({ type: 'boolean' })
  public skipValidationOnSave?: boolean;

  @Attr({ type: 'json' })
  public attachmentFields?: Record<string, unknown>;
}

// Export the Waterline model definition for runtime use
export const FormWLDef = toWaterlineModelDef(FormClass);

// Type interface for backwards compatibility
export interface FormAttributes extends Sails.WaterlineAttributes {
  attachmentFields?: Record<string, unknown>;
  customAngularApp?: Record<string, unknown>;
  editCssClasses?: string;
  fields?: Record<string, unknown>;
  messages?: Record<string, unknown>;
  name: string;
  requiredFieldIndicator?: string;
  skipValidationOnSave?: boolean;
  type?: string;
  viewCssClasses?: string;
  workflowStep?: string | number;
}

export interface FormWaterlineModel extends Sails.Model<FormAttributes> {
  attributes: FormAttributes;
}

declare global {
  const Form: FormWaterlineModel;
}
