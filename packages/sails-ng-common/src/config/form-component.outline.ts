import {CanVisit} from "./visitor/base.outline";
import {FieldModelDefinitionFrame, FieldModelDefinitionOutline} from "./field-model.outline";
import {FieldComponentDefinitionFrame, FieldComponentDefinitionOutline} from "./field-component.outline";
import {FormModesConfig} from "./shared.outline";
import {FieldLayoutDefinitionFrame, FieldLayoutDefinitionOutline} from "./field-layout.outline";
import {ComponentClassNamesType, LayoutClassNamesType, ModelClassNamesType} from "./dictionary.model";


/**
 * The kinds of conditions available for expressions.
 *
 * JSONPointer - Uses JSON Pointer syntax to point to a value in the form data. For wiring events between fields, this is often sufficient. This is simple and fast to evaluate.
 *
 * JSONata - Uses the JSONata query and transformation language to evaluate more complex conditions based on data supplied at evaluation time. Template must resolve to a truthy value. This is more powerful but may be slower to evaluate.
 *
 * JSONataQuery - Similar to JSONata, but uses the FormComponent.componentDefQuerySource in addition to those supplied at evaluation time. This is useful for conditions that depend on multiple fields or the structure of the form itself.
 *
 * @see FormExpressionsConfigFrame.conditionKind
 */
export const ExpressionsConditionKind = {
    JSONPointer: "jsonpointer",
    JSONata: "jsonata",
    JSONataQuery: "jsonata_query",
} as const;

export type ExpressionsConditionKindType = typeof ExpressionsConditionKind[keyof typeof ExpressionsConditionKind];

/**
 * The shared properties for an expression config.
 *
 * Notes:
 * - 'target': Optional property name that will receive the result of the expression.
 *   If unspecified, the result is not stored. Note that the template or operation might set values directly.
 * - 'operation' and 'template': Must specify one of these.
 */
interface FormExpressionsBaseConfigFrame {
    /**
     * The JSONata template or customised JSONPointer string that resolves to a boolean indicating whether to execute the expression. If unspecified, the expression always executes.
     */
    condition?: string;
    /**
     * The kind of condition to use.
     */
    conditionKind?: ExpressionsConditionKindType;
    /**
     * Indicates whether the expression has a template defined. Set when template is stripped prior to sending to client.
     */
    hasTemplate?: boolean;
    /**
     * Optional flag to indicate whether the expression will run when the form is ready. Defaults to true.
     */
    runOnFormReady?: boolean;
}

interface FormExpressionsOperationConfigFrame  {
  /**
   * The name of the entry in the `operations` dictionary to execute.
   */
  operation: string;
}

interface FormExpressionsTemplateConfigFrame {
  /**
   * The JSONata template for the expression. This only is populated in the server-side, the client side will retrieve the template from the pre-compiled dictionary.
   */
  template: string;
}

export const FormExpressionsTargetModelValue = "model.value" as const;
type FormExpressionsTargetModelValueType = typeof FormExpressionsTargetModelValue;
interface FormExpressionsTargetModelValueConfigFrame {
  /**
   * The component's model value will receive the result of the expression.
   */
  target: FormExpressionsTargetModelValueType;
}

export const FormExpressionsTargetLayoutPrefix = "layout." as const;
interface FormExpressionsTargetLayoutConfigFrame {
  /**
   * Layout property name that will receive the result of the expression.
   */
  target: `layout.${string}`;
}

export const FormExpressionsTargetComponentPrefix = "component." as const;
interface FormExpressionsTargetComponentConfigFrame {
  /**
   * Component property name that will receive the result of the expression.
   */
  target: `component.${string}` ;
}

export const FormExpressionsTargetValidationGroups = "form.enabledValidationGroups" as const;
type FormExpressionsTargetValidationGroupsType = typeof FormExpressionsTargetValidationGroups;
interface FormExpressionsTargetValidationGroupsConfigFrame {
  /**
   * Create an event to change the enabled validation groups to be as the result of the expression specifies.
   */
  target: FormExpressionsTargetValidationGroupsType;
}

export interface FormExpressionsOperationNoTargetConfigFrame extends FormExpressionsBaseConfigFrame, FormExpressionsOperationConfigFrame {
}

export interface FormExpressionsTemplateNoTargetConfigFrame extends FormExpressionsBaseConfigFrame, FormExpressionsTemplateConfigFrame {
}

export interface FormExpressionsOperationModelValueConfigFrame extends FormExpressionsOperationNoTargetConfigFrame, FormExpressionsTargetModelValueConfigFrame {
}

export interface FormExpressionsTemplateModelValueConfigFrame extends FormExpressionsTemplateNoTargetConfigFrame, FormExpressionsTargetModelValueConfigFrame {
}

export interface FormExpressionsOperationLayoutConfigFrame extends FormExpressionsOperationNoTargetConfigFrame, FormExpressionsTargetLayoutConfigFrame {
}

export interface FormExpressionsTemplateLayoutConfigFrame extends FormExpressionsTemplateNoTargetConfigFrame, FormExpressionsTargetLayoutConfigFrame {
}

export interface FormExpressionsOperationComponentConfigFrame extends FormExpressionsOperationNoTargetConfigFrame, FormExpressionsTargetComponentConfigFrame {
}

export interface FormExpressionsTemplateComponentConfigFrame extends FormExpressionsTemplateNoTargetConfigFrame, FormExpressionsTargetComponentConfigFrame {
}

export interface FormExpressionsOperationValidationGroupsConfigFrame extends FormExpressionsOperationNoTargetConfigFrame, FormExpressionsTargetValidationGroupsConfigFrame {
}

export interface FormExpressionsTemplateValidationGroupsConfigFrame extends FormExpressionsTemplateNoTargetConfigFrame, FormExpressionsTargetValidationGroupsConfigFrame {
}

/**
 * The available form expression configuration structures.
 */
export type FormExpressionsOptionsConfigFrame =
  | FormExpressionsOperationNoTargetConfigFrame
  | FormExpressionsTemplateNoTargetConfigFrame
  | FormExpressionsOperationModelValueConfigFrame
  | FormExpressionsTemplateModelValueConfigFrame
  | FormExpressionsOperationLayoutConfigFrame
  | FormExpressionsTemplateLayoutConfigFrame
  | FormExpressionsOperationComponentConfigFrame
  | FormExpressionsTemplateComponentConfigFrame
  | FormExpressionsOperationValidationGroupsConfigFrame
  | FormExpressionsTemplateValidationGroupsConfigFrame
;

/**
 * The expressions for a component.
 */
export interface FormExpressionsConfigFrame {
    /**
     * The unique short name of the expression.
     */
    name: string;
    /**
     * A description of the expression.
     */
    description?: string;
    /**
     * The configuration for the expression.
     */
    config: FormExpressionsOptionsConfigFrame;
}

export interface FormExpressionsConfigOutline extends FormExpressionsConfigFrame {

}

export interface FormConstraintConfigFrame {
    /**
     * The current user must fulfill these authorization constraints.
     * This is only available on the server side.
     * These are checked first.
     */
    authorization?: FormConstraintAuthorizationConfigFrame;
    /**
     * This form field is included when the displayed form is in one of these modes.
     * If this is not specified, the form field will be included in all modes.
     */
    allowModes?: FormModesConfig[];
}

export interface FormConstraintConfigOutline extends FormConstraintConfigFrame {
    authorization?: FormConstraintAuthorizationConfigOutline;
}

export interface FormConstraintAuthorizationConfigFrame {
    /**
     * The current user must have at least one of these roles for the form field to be included.
     *
     * e.g. allowRoles: ['Admin', 'Librarians'],
     */
    allowRoles?: string[];
}

export interface FormConstraintAuthorizationConfigOutline extends FormConstraintAuthorizationConfigFrame {

}

/**
 * The classes to transform to for each item that requires a class.
 */
export type FormOverrideModeClassesConfig = {
    component?: ComponentClassNamesType;
    model?: ModelClassNamesType;
    layout?: LayoutClassNamesType;
}

/**
 * The form mode to class name mapping.
 */
export type FormOverrideModesClassConfig = Partial<{
    /**
     * Optional entries where the key is a form mode,
     * and the value is the class to use for each item that requires a class.
     */
    [key in FormModesConfig]: FormOverrideModeClassesConfig;
}>;

/**
 * The available options for overriding the form config.
 */
export interface FormOverrideConfigFrame {
    /**
     * Replace the form component name property value with the value of this property.
     */
    replaceName?: string;

    /**
     * When the form mode is the object key (one of the form modes), set the class as per the value object.
     */
    formModeClasses?: FormOverrideModesClassConfig;

    /**
     * The name of the reusable form config to insert in place of this element.
     */
    reusableFormName?: string;
}

export interface FormOverrideConfigOutline extends FormOverrideConfigFrame {

}

/**
 * The form component interface that provides typing for the object literal and schema.
 */
export interface FormComponentDefinitionFrame {
    /**
     * top-level field name, applies to field and the component, etc.
     */
    name: string;
    /**
     * The definition of the model that backs the form field.
     */
    model?: FieldModelDefinitionFrame<unknown>;
    /**
     * The definition of the client-side component for the form field.
     */
    component: FieldComponentDefinitionFrame;
    /**
     * The definition of the client-side layout for this form field.
     */
    layout?: FieldLayoutDefinitionFrame;
    /**
     * A record with string keys and expression template values for defining expressions.
     */
    expressions?: FormExpressionsConfigFrame[];
    /**
     * For a custom form component definition, module defines where to find the definition.
     */
    module?: string;
    /**
     * Constraints / prerequisites for this component to be included in the form definition.
     */
    constraints?: FormConstraintConfigFrame;
    /**
     * Optional ways to extend or replace parts of the form config.
     */
    overrides?: FormOverrideConfigFrame;
}

export interface FormComponentDefinitionOutline extends FormComponentDefinitionFrame, CanVisit {
    model?: FieldModelDefinitionOutline<unknown>;
    component: FieldComponentDefinitionOutline;
    layout?: FieldLayoutDefinitionOutline;
    expressions?: FormExpressionsConfigOutline[];
    constraints?: FormConstraintConfigOutline;
    overrides?: FormOverrideConfigOutline;
}
