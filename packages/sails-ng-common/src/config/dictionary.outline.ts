import {
    RepeatableElementFieldLayoutDefinitionFrame, RepeatableElementFieldLayoutDefinitionOutline,
    RepeatableTypes,
} from "./component/repeatable.outline";
import {GroupTypes} from "./component/group.outline";
import {SaveButtonTypes} from "./component/save-button.outline";
import {TextAreaTypes} from "./component/text-area.outline";
import {ContentTypes} from "./component/content.outline";
import {SimpleInputTypes} from "./component/simple-input.outline";
import {ValidationSummaryTypes} from "./component/validation-summary.outline";
import {
    TabContentFormComponentDefinitionOutline,
    TabContentFormComponentDefinitionFrame,
    TabContentTypes,
} from "./component/tab-content.outline";
import {TabTypes} from "./component/tab.outline";
import {DefaultLayoutTypes} from "./component/default-layout.outline";


import {
    FieldLayoutDefinitionFrameKindType,
    FieldLayoutDefinitionKindType,
    FormComponentDefinitionFrameKindType,
    FormComponentDefinitionKindType
} from "./shared.outline";
import {CheckboxInputTypes} from "./component/checkbox-input.outline";
import {DropdownInputTypes} from "./component/dropdown-input.outline";
import {RadioInputTypes} from "./component/radio-input.outline";
import {DateInputTypes} from "./component/date-input.outline";


/* Ensure all available types, interfaces, and classes are added here. */


/**
 * The static type union of all available interfaces that provides typing for the object literal and schema.
 * Other convenience mappings are built from this.
 */
export type AllTypes = DefaultLayoutTypes
    | RepeatableTypes
    | GroupTypes
    | SaveButtonTypes
    | TextAreaTypes
    | ContentTypes
    | SimpleInputTypes
    | ValidationSummaryTypes
    | TabContentTypes
    | TabTypes
    | CheckboxInputTypes
    | DropdownInputTypes
    | RadioInputTypes
    | DateInputTypes
    ;


/*
 * The variables below here are conveniences that provide access to the various groups
 * of types, interfaces, and classes.
 *
 * These should update as entries are added above, and should not need to be changed.
 *
 * Compile-time-only type unions for the various kinds of classes.
 * These make it easier to reference the set of types of one kind.
 */

/**
 * The form component definition frames available for use in any list of form components.
 */
export type AvailableFormComponentDefinitionFrames = Exclude<Extract<AllTypes, {
    kind: FormComponentDefinitionFrameKindType
}>, TabContentFormComponentDefinitionFrame>['class'];
/**
 * All possible form component definition outlines.
 */
export type AllFormComponentDefinitionOutlines = Extract<AllTypes, {
    kind: FormComponentDefinitionKindType
}>['class'];
/**
 * The form component definition outlines available for use in any list of form components.
 */
export type AvailableFormComponentDefinitionOutlines = Exclude<Extract<AllTypes, {
    kind: FormComponentDefinitionKindType
}>, TabContentFormComponentDefinitionOutline>['class'];
/**
 * The field layout definition outlines available for use by any form component.
 */
export type AvailableFieldLayoutDefinitionOutlines = Exclude<Extract<AllTypes, {
    kind: FieldLayoutDefinitionKindType
}>, RepeatableElementFieldLayoutDefinitionFrame>['class'];
/**
 * The field layout definition frames available for use by any form component.
 */
export type AvailableFieldLayoutDefinitionFrames = Exclude<Extract<AllTypes, {
    kind: FieldLayoutDefinitionFrameKindType
}>, RepeatableElementFieldLayoutDefinitionOutline>['class'];
