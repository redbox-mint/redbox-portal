import {
  RepeatableElementFieldLayoutDefinitionFrame,
  RepeatableElementFieldLayoutDefinitionOutline,
  RepeatableTypes,
} from './component/repeatable.outline';
import { GroupTypes } from './component/group.outline';
import { SaveButtonTypes } from './component/save-button.outline';
import { TextAreaTypes } from './component/text-area.outline';
import { ContentTypes } from './component/content.outline';
import {
    SimpleInputFormComponentDefinitionFrame,
    SimpleInputFormComponentDefinitionOutline,
    SimpleInputTypes
} from './component/simple-input.outline';
import { ValidationSummaryTypes } from './component/validation-summary.outline';
import {
  TabContentFormComponentDefinitionOutline,
  TabContentFormComponentDefinitionFrame,
  TabContentTypes,
} from './component/tab-content.outline';
import { TabTypes } from './component/tab.outline';
import { DefaultLayoutTypes } from './component/default-layout.outline';import { InlineLayoutTypes } from './component/inline-layout.outline';
import {
  FieldLayoutDefinitionFrameKindType,
  FieldLayoutDefinitionKindType,
  FormComponentDefinitionFrameKindType,
  FormComponentDefinitionKindType,
} from './shared.outline';
import { CheckboxInputTypes } from './component/checkbox-input.outline';
import { DropdownInputTypes } from './component/dropdown-input.outline';
import { RadioInputTypes } from './component/radio-input.outline';
import { DateInputTypes } from './component/date-input.outline';
import { ReusableTypes } from './component/reusable.outline';
import { CheckboxTreeTypes } from './component/checkbox-tree.outline';
import { TypeaheadInputTypes } from './component/typeahead-input.outline';
import { RichTextEditorTypes } from './component/rich-text-editor.outline';
import { MapTypes } from './component/map.outline';
import { FileUploadTypes } from './component/file-upload.outline';
import { CancelButtonTypes } from './component/cancel-button.outline';
import { TabNavButtonTypes } from './component/tab-nav-button.outline';
import {
  CheckboxInputFormComponentDefinitionFrame,
  CheckboxInputFormComponentDefinitionOutline,
} from "./component/checkbox-input.outline";
import {
  RadioInputFormComponentDefinitionFrame,
  RadioInputFormComponentDefinitionOutline,
} from "./component/radio-input.outline";
import {
  ReusableFormComponentDefinitionFrame,
  ReusableFormComponentDefinitionOutline
} from "./component/reusable.outline";
import {QuestionTreeTypes} from "./component/question-tree.outline";


/**
 * The static type union of all available interfaces that provides typing for the object literal and schema.
 * Other convenience mappings are built from this.
 */
export type AllTypes =
  | DefaultLayoutTypes
  | InlineLayoutTypes
  | RepeatableTypes
  | GroupTypes
  | SaveButtonTypes
  | CancelButtonTypes
  | TabNavButtonTypes
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
  | ReusableTypes
  | CheckboxTreeTypes
  | TypeaheadInputTypes
  | RichTextEditorTypes
  | MapTypes
  | FileUploadTypes
  | QuestionTreeTypes
  ;


/*
 * The variables below here are conveniences that provide access to the various groups
 * of types, interfaces, and classes.
 *
 * These should update as entries are added above, and should not need to be changed.
 *
 * Compile-time-only type unions for the various kinds of classes.
 * These make it easier to reference the set of types of one kind.
 *
 * These include the Reusable component classes because they are used in the migration and construct visitors.
 */

// /**
//  * All form component definition frames.
//  */
// export type AllFormComponentDefinitionFrames = Extract<AllTypes, {
//     kind: FormComponentDefinitionFrameKindType
// }>['class'];

/**
 * The form component definition frames available for use in any list of form components.
 */
export type AvailableFormComponentDefinitionFrames = Exclude<
  Extract<
    AllTypes,
    {
      kind: FormComponentDefinitionFrameKindType;
    }
  >,
  TabContentFormComponentDefinitionFrame
>['class'];

/**
 * All form component definition outlines.
 */
export type AllFormComponentDefinitionOutlines = Extract<
  AllTypes,
  {
    kind: FormComponentDefinitionKindType;
  }
>['class'];

/**
 * The form component definition outlines available for use in any list of form components.
 */
export type AvailableFormComponentDefinitionOutlines = Exclude<
  Extract<
    AllTypes,
    {
      kind: FormComponentDefinitionKindType;
    }
  >,
  TabContentFormComponentDefinitionOutline
>['class'];

/**
 * The field layout definition outlines available for use by any form component.
 */
export type AvailableFieldLayoutDefinitionOutlines = Exclude<
  Extract<
    AllTypes,
    {
      kind: FieldLayoutDefinitionKindType;
    }
  >,
  RepeatableElementFieldLayoutDefinitionFrame
>['class'];

/**
 * The field layout definition frames available for use by any form component.
 */
export type AvailableFieldLayoutDefinitionFrames = Exclude<
  Extract<
    AllTypes,
    {
      kind: FieldLayoutDefinitionFrameKindType;
    }
  >,
  RepeatableElementFieldLayoutDefinitionOutline
>['class'];

/**
 * The type for a mapping of reusable form config name to form config definition.
 */
export type ReusableFormDefinitions = { [key: string]: AvailableFormComponentDefinitionFrames[] };

/**
 * The form component frames available in the question tree component.
 */
export type QuestionTreeFormComponentDefinitionFrames =
    SimpleInputFormComponentDefinitionFrame
    | CheckboxInputFormComponentDefinitionFrame
    | RadioInputFormComponentDefinitionFrame
    | ReusableFormComponentDefinitionFrame
    ;
/**
 * The form component outlines available in the question tree component.
 */
export type QuestionTreeFormComponentDefinitionOutlines =
    SimpleInputFormComponentDefinitionOutline
    | CheckboxInputFormComponentDefinitionOutline
    | RadioInputFormComponentDefinitionOutline
    ;

