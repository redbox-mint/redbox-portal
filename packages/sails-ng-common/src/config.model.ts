import { FormValidatorConfig, FormValidatorDefinition } from "./validation";




export interface HasFormComponentIdentity {
  name?: string | null | undefined; // top-level field name, applies to field and the component, etc.
}

export interface HasFormComponentClass {
  class?: string | null | undefined; // makes the 'layout' optional
}

export interface HasFormComponentConfig {
  config?: object | null | undefined;
}





/**
 * Minimum configuration for all configuration components.
 */
export class FormComponentBaseConfig  {

}






/**
 * The data model description for the field value (e.g. string, object, number, array)
 */
export class FormFieldModelDataConfig {

}