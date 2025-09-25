import {RepeatableFrames, RepeatableOutlines} from "./component/repeatable.outline";
import {GroupFrames, GroupOutlines, } from "./component/group.outline";
import {SaveButtonFrames, SaveButtonOutlines} from "./component/save-button.outline";
import { TextAreaFrames, TextAreaOutlines } from "./component/textarea.outline";
import { ContentFrames, ContentOutlines } from "./component/textblock.outline";
import {SimpleInputFrames, SimpleInputOutlines} from "./component/simpleinput.outline";
import {ValidationSummaryFrames, ValidationSummaryOutlines} from "./component/validation-summary.outline";
import {
    TabContentFieldComponentDefinitionOutline,
    TabContentFieldComponentDefinitionFrame,
    TabContentFormComponentDefinitionOutline,
    TabContentFormComponentDefinitionFrame,
    TabContentFrames, TabContentOutlines,
} from "./component/tab-content.outline";
import {TabFrames, TabOutlines} from "./component/tab.outline";
import {DefaultLayoutFrames, DefaultLayoutOutlines} from "./component/default-layout.outline";

import {
    FieldModelConfigFrame,
    FieldModelConfigOutline,
    FieldModelDefinitionFrame,
    FieldModelDefinitionOutline
} from "./field-model.outline";
import {
    FieldComponentConfigFrame, FieldComponentConfigOutline,
    FieldComponentDefinitionFrame,
    FieldComponentDefinitionOutline
} from "./field-component.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "./form-component.outline";
import {
    FieldLayoutConfigOutline,
    FieldLayoutDefinitionFrame,
    FieldLayoutDefinitionOutline
} from "./field-layout.outline";



/* Ensure all available types, interfaces, and classes are added here. */


/**
 * The static type union of all available interfaces that provides typing for the object literal and schema.
 * Other convenience mappings are built from this.
 */
export type AllFrames = DefaultLayoutFrames
    | RepeatableFrames
    | GroupFrames
    | SaveButtonFrames
    | TextAreaFrames
    | ContentFrames
    | SimpleInputFrames
    | ValidationSummaryFrames
    | TabContentFrames
    | TabFrames
    ;

export type AllOutlines = DefaultLayoutOutlines
| RepeatableOutlines
    | GroupOutlines
    | SaveButtonOutlines
    | TextAreaOutlines
    | ContentOutlines
    | SimpleInputOutlines
    | ValidationSummaryOutlines
    | TabContentOutlines
    | TabOutlines
;
/*
 * The variables below here are conveniences that provide access to the various groups
 * of types, interfaces, and classes.
 * These should update as entries are added above, and should not need to be changed.
 */


/*
 * Compile-time-only type unions for the various kinds of classes.
 * These make it easier to reference the set of types of one kind.
 */


// All FormComponentDefinition Frames and Classes

export type AllFormComponentDefinitionFrames = Extract<AllFrames, FormComponentDefinitionFrame>;
export type AllFormComponentDefinitionOutlines = Extract<AllOutlines, FormComponentDefinitionOutline>;


// The available FormComponentDefinition Frames and Classes that are not special and can be used anywhere.

export type AvailableFormComponentDefinitionFrames = Exclude<AllFormComponentDefinitionFrames, TabContentFormComponentDefinitionFrame>;
export type AvailableFormComponentDefinitionOutlines = Exclude<AllFormComponentDefinitionOutlines, TabContentFormComponentDefinitionOutline>;


// All FieldComponentDefinition Frames and Classes

export type AllFieldComponentDefinitionFrames = Extract<AllFrames, FieldComponentDefinitionFrame>;
export type AllFieldComponentDefinitionOutlines = Extract<AllOutlines, FieldComponentDefinitionOutline>;


// The available FieldComponentDefinition Frames and Classes that are not special and can be used anywhere.

export type AvailableFieldComponentDefinitionFrames = Exclude<AllFieldComponentDefinitionFrames, TabContentFieldComponentDefinitionFrame>;
export type AvailableFieldComponentDefinitionOutlines = Exclude<AllFieldComponentDefinitionOutlines, TabContentFieldComponentDefinitionOutline>;

export type TabContentFieldComponentDefinitionFrames = Extract<AllFieldComponentDefinitionFrames, TabContentFieldComponentDefinitionFrame>;
export type TabContentFieldComponentDefinitionOutlines = Extract<AllFieldComponentDefinitionOutlines, TabContentFieldComponentDefinitionOutline>;


// All FieldComponentConfig Frames and Classes

export type AllFieldComponentConfigFrames = Extract<AllFrames, FieldComponentConfigFrame>;
export type AllFieldComponentConfigs = Extract<AllOutlines, FieldComponentConfigOutline>;


// The available FieldComponentDefinition Frames and Classes that are not special and can be used anywhere.

export type AvailableFieldComponentConfigFrames = Exclude<AllFieldComponentConfigFrames, ''>;
export type AvailableFieldComponentConfigs = Exclude<AllFieldComponentConfigs, ''>;

// All FieldModelDefinition Frames and Classes

export type AllFieldModelDefinitionFrames = Extract<AllFrames, FieldModelDefinitionFrame<unknown>>;
export type AllFieldModelDefinitionOutlines = Extract<AllOutlines, FieldModelDefinitionOutline<unknown>>;


// The available FieldModelDefinition Frames and Classes that are not special and can be used anywhere.

export type AvailableFieldModelDefinitionFrames = Exclude<AllFieldModelDefinitionFrames, ''>;
export type AvailableFieldModelDefinitionOutlines = Exclude<AllFieldModelDefinitionOutlines, ''>;

// All FieldModelConfig Frames and Classes

export type AllFieldModelConfigFrames = Extract<AllFrames, FieldModelConfigFrame<unknown>>;
export type AllFieldModelConfigs = Extract<AllOutlines, FieldModelConfigOutline<unknown>>;


// The available FieldModelConfig Frames and Classes that are not special and can be used anywhere.

export type AvailableFieldModelConfigFrames = Exclude<AllFieldModelConfigFrames, ''>;
export type AvailableFieldModelConfigs = Exclude<AllFieldModelConfigs, ''>;

// All FieldLayoutDefinition Frames and Classes

export type AllFieldLayoutDefinitionFrames = Extract<AllFrames, FieldLayoutDefinitionFrame>;
export type AllFieldLayoutDefinitionOutlines = Extract<AllOutlines, FieldLayoutDefinitionOutline>;


// The available FieldLayoutDefinition Frames and Classes that are not special and can be used anywhere.

export type AvailableFieldLayoutDefinitionFrames = Exclude<AllFieldLayoutDefinitionFrames, ''>;
export type AvailableFieldLayoutDefinitionOutlines = Exclude<AllFieldLayoutDefinitionOutlines, ''>;

// All FieldLayoutConfig Frames and Classes

export type AllFieldLayoutConfigFrames = Exclude<AllFrames, FieldComponentConfigFrame>;
export type AllFieldLayoutConfigs = Extract<AllOutlines, FieldLayoutConfigOutline>;


// The available FieldLayoutConfig Frames and Classes that are not special and can be used anywhere.

export type AvailableFieldLayoutConfigFrames = Exclude<AllFieldLayoutConfigFrames, ''>;
export type AvailableFieldLayoutConfigs = Exclude<AllFieldLayoutConfigs, ''>;
