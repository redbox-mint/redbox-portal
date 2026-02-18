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

  @Attr({ type: 'json' })
  public configuration?: FormConfigFrame;
}

// Export the Waterline model definition for runtime use
export const FormWLDef = toWaterlineModelDef(FormClass);

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
