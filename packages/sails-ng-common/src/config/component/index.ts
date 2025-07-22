import {
    RepeatableElementFormFieldLayoutConfig,
    RepeatableElementFormFieldLayoutDefinition,
    RepeatableFormFieldComponentConfig,
    RepeatableFormFieldComponentDefinition,
    RepeatableFormFieldModelConfig,
    RepeatableFormFieldModelDefinition
} from "./repeatable.model";
import {
    ValidationSummaryFormFieldComponentConfig,
    ValidationSummaryFormFieldComponentDefinition,
    ValidationSummaryFormFieldModelConfig,
    ValidationSummaryFormFieldModelDefinition
} from "./validation-summary.model";
import {
    GroupFormFieldComponentConfig,
    GroupFormFieldComponentDefinition,
    GroupFormFieldModelConfig,
    GroupFormFieldModelDefinition
} from "./group.model";
import {
    TextFormFieldComponentConfig,
    TextFormFieldComponentDefinition,
    TextFormFieldModelConfig,
    TextFormFieldModelDefinition
} from "./text.model";
import {DefaultFormFieldLayoutConfig, DefaultFormFieldLayoutDefinition} from "./default-layout.model";

/**
 * Possible form field component definitions.
 */
export type FormFieldComponentDefinition =
    TextFormFieldComponentDefinition |
    RepeatableFormFieldComponentDefinition |
    ValidationSummaryFormFieldComponentDefinition |
    GroupFormFieldComponentDefinition;

/**
 * Possible form field component configs.
 */
export type FormFieldComponentConfig =
    TextFormFieldComponentConfig |
    RepeatableFormFieldComponentConfig |
    ValidationSummaryFormFieldComponentConfig |
    GroupFormFieldComponentConfig;

/**
 * Possible form field model definitions.
 */
export type FormFieldModelDefinition =
    TextFormFieldModelDefinition |
    RepeatableFormFieldModelDefinition |
    ValidationSummaryFormFieldModelDefinition |
    GroupFormFieldModelDefinition;


/**
 * Possible form field model configs.
 */
export type FormFieldModelConfig =
    TextFormFieldModelConfig |
    RepeatableFormFieldModelConfig |
    ValidationSummaryFormFieldModelConfig |
    GroupFormFieldModelConfig;


/**
 * Possible form field layout definitions.
 */
export type FormFieldLayoutDefinition =
    DefaultFormFieldLayoutDefinition |
    RepeatableElementFormFieldLayoutDefinition

/**
 * Possible form field layout configs.
 */
export type FormFieldLayoutConfig =
    DefaultFormFieldLayoutConfig |
    RepeatableElementFormFieldLayoutConfig

export * from './default-layout.model'
export * from './group.model'
export * from './repeatable.model'
export * from './text.model'
export * from './validation-summary.model'
