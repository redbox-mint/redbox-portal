import {
    RepeatableElementFormFieldLayoutConfig,
    RepeatableFormFieldComponentDefinition,
    RepeatableFormFieldModelDefinition
} from "./repeatable.model";
import {ValidationSummaryFormFieldComponentDefinition, ValidationSummaryFormFieldModelDefinition} from "./validation-summary.model";
import {GroupFormFieldComponentDefinition, GroupFormFieldModelDefinition} from "./group.model";

/**
 * Possible form field component definitions.
 */
export type FormFieldComponentDefinition =
    RepeatableFormFieldComponentDefinition |
    ValidationSummaryFormFieldComponentDefinition |
    GroupFormFieldComponentDefinition;

/**
 * Possible form field model definitions.
 */
export type FormFieldModelDefinition<ValueType> =
    RepeatableFormFieldModelDefinition<ValueType> |
    ValidationSummaryFormFieldModelDefinition<ValueType>  |
    GroupFormFieldModelDefinition<ValueType> ;

/**
 * Possible form field layout definitions.
 */
export type FormFieldLayoutDefinition =
    RepeatableElementFormFieldLayoutConfig

export * from './validation-summary.model'
export * from './repeatable.model'
