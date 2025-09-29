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
    SimpleInputComponentConfig,
    SimpleInputComponentDefinition,
    SimpleInputModelConfig,
    SimpleInputModelDefinition
} from "./simple-input.model";
import {DefaultFormFieldLayoutConfig, DefaultFormFieldLayoutDefinition} from "./default-layout.model";
import {TabComponentConfig, TabFormFieldComponentDefinition, TabContentComponentDefinition} from "./tab.model";
import { ContentComponentConfig, ContentComponentDefinition } from "./textblock.model";
import { SaveButtonComponentDefinition, SaveButtonComponentConfig } from "./save-button.model";
import { TabComponentFormFieldLayoutDefinition, TabComponentFormFieldLayoutConfig } from "./tab.model";
import { TextAreaComponentConfig, TextAreaComponentDefinition, TextareaModelConfig, TextareaModelDefinition } from "./textarea.model";
import { DropdownInputComponentConfig, DropdownInputComponentDefinition, DropdownInputModelConfig, DropdownInputModelDefinition } from "./dropdown-input.model";
import { CheckboxInputComponentConfig, CheckboxInputComponentDefinition, CheckboxInputModelConfig, CheckboxInputModelDefinition } from "./checkbox-input.model";
import { RadioInputComponentConfig, RadioInputComponentDefinition, RadioInputModelConfig, RadioInputModelDefinition } from "./radio-input.model";
import { DateInputComponentConfig, DateInputComponentDefinition, DateInputModelConfig, DateInputModelDefinition } from "./date-input.model";
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
    TextAreaComponentDefinition |
    DropdownInputComponentDefinition |
    CheckboxInputComponentDefinition |
    RadioInputComponentDefinition |
    DateInputComponentDefinition;

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
    TextAreaComponentConfig |
    DropdownInputComponentConfig |
    CheckboxInputComponentConfig |
    RadioInputComponentConfig |
    DateInputComponentConfig;

/**
 * Possible form field model definitions.
 */
export type FormFieldModelDefinition =
    SimpleInputModelDefinition |
    RepeatableFormFieldModelDefinition |
    ValidationSummaryFormFieldModelDefinition |
    GroupFormFieldModelDefinition | 
    TextareaModelDefinition |
    DropdownInputModelDefinition |
    CheckboxInputModelDefinition |
    RadioInputModelDefinition |
    DateInputModelDefinition;


/**
 * Possible form field model configs.
 */
export type FormFieldModelConfig =
    SimpleInputModelConfig |
    RepeatableFormFieldModelConfig |
    ValidationSummaryFormFieldModelConfig |
    GroupFormFieldModelConfig | 
    TextareaModelConfig |
    DropdownInputModelConfig |
    CheckboxInputModelConfig |
    RadioInputModelConfig |
    DateInputModelConfig;


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

export * from './default-layout.model'
export * from './group.model'
export * from './repeatable.model'
export * from './simple-input.model'
export * from './validation-summary.model'
export * from './tab.model'
export * from './save-button.model'
export * from './textblock.model'
export * from './dropdown-input.model'
export * from './checkbox-input.model'
export * from './radio-input.model'
export * from './date-input.model'