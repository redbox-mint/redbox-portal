import {
    ContentComponentConfig,
    ContentComponentDefinition,
    DefaultFormFieldLayoutConfig,
    DefaultFormFieldLayoutDefinition,
    GroupFormFieldComponentConfig,
    GroupFormFieldComponentDefinition,
    GroupFormFieldModelConfig,
    GroupFormFieldModelDefinition,
    RepeatableElementFormFieldLayoutConfig,
    RepeatableElementFormFieldLayoutDefinition,
    RepeatableFormFieldComponentConfig,
    RepeatableFormFieldComponentDefinition,
    RepeatableFormFieldModelConfig,
    RepeatableFormFieldModelDefinition,
    SaveButtonComponentDefinition,
    SaveButtonComponentConfig,
    SimpleInputComponentConfig,
    SimpleInputComponentDefinition,
    SimpleInputModelConfig,
    SimpleInputModelDefinition,
    TabComponentConfig,
    TabFormFieldComponentDefinition,
    TabContentComponentDefinition,
    TabComponentFormFieldLayoutDefinition,
    TabComponentFormFieldLayoutConfig,
    TextAreaComponentConfig,
    TextAreaComponentDefinition,
    TextareaModelConfig,
    TextareaModelDefinition,
    ValidationSummaryFormFieldComponentConfig,
    ValidationSummaryFormFieldComponentDefinition,
    ValidationSummaryFormFieldModelConfig,
    ValidationSummaryFormFieldModelDefinition,
    RepeatableComponentName,
    RepeatableModelName,
    RepeatableElementLayoutComponentName, ContentComponentName,
} from "./component";
import {BaseFormFieldComponentDefinition} from "./form-field-component.model";
import {BaseFormFieldLayoutDefinition} from "./form-field-layout.model";
import {BaseFormFieldModelDefinition} from "./form-field-model.model";


/**
 * Possible form field component definitions.
 */
export type FormFieldComponentDefinition =
    SimpleInputComponentDefinition |
    ContentComponentDefinition |
    RepeatableFormFieldComponentDefinition |
    ValidationSummaryFormFieldComponentDefinition |
    GroupFormFieldComponentDefinition |
    TabFormFieldComponentDefinition |
    TabContentComponentDefinition |
    SaveButtonComponentDefinition |
    TextAreaComponentDefinition;

/**
 * Possible form field component configs.
 */
export type FormFieldComponentConfig =
    SimpleInputComponentConfig |
    ContentComponentConfig |
    RepeatableFormFieldComponentConfig |
    ValidationSummaryFormFieldComponentConfig |
    GroupFormFieldComponentConfig |
    TabComponentConfig |
    SaveButtonComponentConfig |
    TextAreaComponentConfig;

/**
 * Possible form field model definitions.
 */
export type FormFieldModelDefinition =
    SimpleInputModelDefinition |
    RepeatableFormFieldModelDefinition |
    ValidationSummaryFormFieldModelDefinition |
    GroupFormFieldModelDefinition |
    TextareaModelDefinition;


/**
 * Possible form field model configs.
 */
export type FormFieldModelConfig =
    SimpleInputModelConfig |
    RepeatableFormFieldModelConfig |
    ValidationSummaryFormFieldModelConfig |
    GroupFormFieldModelConfig |
    TextareaModelConfig;


/**
 * Possible form field layout definitions.
 */
export type FormFieldLayoutDefinition =
    DefaultFormFieldLayoutDefinition |
    RepeatableElementFormFieldLayoutDefinition |
    TabComponentFormFieldLayoutDefinition;

/**
 * Possible form field layout configs.
 */
export type FormFieldLayoutConfig =
    DefaultFormFieldLayoutConfig |
    RepeatableElementFormFieldLayoutConfig |
    TabComponentFormFieldLayoutConfig;

/**
 * Static dictionary that maps class name strings to
 * classes, which enables obtaining the class without evaluating text as js.
 */
// TODO: consider how to use these interfaces to type the map.
// : {[index: string]: BaseFormFieldComponentDefinition | BaseFormFieldLayoutDefinition | BaseFormFieldModelDefinition<unknown> }
export const staticNameModelCompMap = {
    [RepeatableComponentName]: RepeatableFormFieldComponentDefinition,
    [RepeatableModelName]: RepeatableFormFieldModelDefinition,
    [RepeatableElementLayoutComponentName]: RepeatableFormFieldModelDefinition,
    [ContentComponentName]: ContentComponentDefinition,
};