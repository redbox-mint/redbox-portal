import {
    RepeatableElementFormFieldLayoutDefinition,
    RepeatableFormFieldComponentDefinition,
    RepeatableFormFieldModelDefinition
} from "./repeatable.model";
import {
    ValidationSummaryFormFieldComponentDefinition,
    ValidationSummaryFormFieldModelDefinition
} from "./validation-summary.model";
import {GroupFormFieldComponentDefinition, GroupFormFieldModelDefinition} from "./group.model";
import {TextFormFieldComponentDefinition, TextFormFieldModelDefinition} from "./text.model";
import {DefaultFormFieldLayoutDefinition} from "./default-layout.model";

/**
 * Possible form field component definitions.
 */
export type FormFieldComponentDefinition =
    TextFormFieldComponentDefinition |
    RepeatableFormFieldComponentDefinition |
    ValidationSummaryFormFieldComponentDefinition |
    GroupFormFieldComponentDefinition;

/**
 * Possible form field model definitions.
 */
export type FormFieldModelDefinition<ValueType> =
    TextFormFieldModelDefinition<ValueType> |
    RepeatableFormFieldModelDefinition<ValueType> |
    ValidationSummaryFormFieldModelDefinition<ValueType> |
    GroupFormFieldModelDefinition<ValueType>;

/**
 * Possible form field layout definitions.
 */
export type FormFieldLayoutDefinition =
    DefaultFormFieldLayoutDefinition |
    RepeatableElementFormFieldLayoutDefinition

export * from './default-layout.model'
export * from './group.model'
export * from './repeatable.model'
export * from './text.model'
export * from './validation-summary.model'
