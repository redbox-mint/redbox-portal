/// <reference path="../sails.ts" />
import { Entity, Attr, BelongsTo, toWaterlineModelDef } from '../decorators';
import { FormConfigFrame } from "@researchdatabox/sails-ng-common";
import { BrandingConfigAttributes } from './BrandingConfig';


@Entity('form')
export class FormClass {
  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  // @Attr({ type: 'json' })
  // public customAngularApp?: Record<string, unknown>;

  // @Attr({ type: 'json' })
  // public fields?: Record<string, unknown>;

  // @Attr({ type: 'string' })
  // public type?: string;

  // @Attr({ type: 'json' })
  // public messages?: Record<string, unknown>;

  // @Attr({ type: 'string' })
  // public requiredFieldIndicator?: string;

  // @Attr({ type: 'string' })
  // public viewCssClasses?: string;

  // @Attr({ type: 'string' })
  // public editCssClasses?: string;

  // @Attr({ type: 'boolean' })
  // public skipValidationOnSave?: boolean;

  // @Attr({ type: 'json' })
  // public attachmentFields?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public configuration?: FormConfigFrame;
}

// Export the Waterline model definition for runtime use
export const FormWLDef = toWaterlineModelDef(FormClass);

// Type interface for backwards compatibility
// export interface FormAttributes extends Sails.WaterlineAttributes {
//   attachmentFields?: Record<string, unknown>;
//   customAngularApp?: Record<string, unknown>;
//   editCssClasses?: string;
//   fields?: Record<string, unknown>;
//   messages?: Record<string, unknown>;
//   name: string;
//   requiredFieldIndicator?: string;
//   skipValidationOnSave?: boolean;
//   type?: string;
//   viewCssClasses?: string;
//   workflowStep?: string | number;
// }

export interface FormAttributes extends Sails.WaterlineAttributes {
  name: string;
  branding: string | number | BrandingConfigAttributes;
  configuration?: FormConfigFrame;
}

export interface FormWaterlineModel extends Sails.Model<FormAttributes> {
  attributes: FormAttributes;
}

declare global {
  var Form: FormWaterlineModel;
}
