import {
  SimpleInputFieldComponentDefinitionOutline,
  SimpleInputFieldModelDefinitionOutline,
  SimpleInputFormComponentDefinitionOutline,
} from '../component/simple-input.outline';
import {
  ContentFieldComponentDefinitionOutline,
  ContentFormComponentDefinitionOutline,
} from '../component/content.outline';
import {
  RepeatableElementFieldLayoutDefinitionOutline,
  RepeatableFieldComponentDefinitionOutline,
  RepeatableFieldModelDefinitionOutline,
  RepeatableFormComponentDefinitionOutline,
} from '../component/repeatable.outline';
import {
  ValidationSummaryFieldComponentDefinitionOutline,
  ValidationSummaryFormComponentDefinitionOutline,
} from '../component/validation-summary.outline';
import {
  GroupFieldComponentDefinitionOutline,
  GroupFieldModelDefinitionOutline,
  GroupFormComponentDefinitionOutline,
} from '../component/group.outline';
import {
  TabFieldComponentDefinitionOutline,
  TabFieldLayoutDefinitionOutline,
  TabFormComponentDefinitionOutline,
} from '../component/tab.outline';
import {
  TabContentFieldComponentDefinitionOutline,
  TabContentFieldLayoutDefinitionOutline,
  TabContentFormComponentDefinitionOutline,
} from '../component/tab-content.outline';
import {
  SaveButtonFieldComponentDefinitionOutline,
  SaveButtonFormComponentDefinitionOutline,
} from '../component/save-button.outline';
import {
  CancelButtonFieldComponentDefinitionOutline,
  CancelButtonFormComponentDefinitionOutline,
} from '../component/cancel-button.outline';
import {
  TabNavButtonFieldComponentDefinitionOutline,
  TabNavButtonFormComponentDefinitionOutline,
} from '../component/tab-nav-button.outline';
import {
  TextAreaFieldComponentDefinitionOutline,
  TextAreaFieldModelDefinitionOutline,
  TextAreaFormComponentDefinitionOutline,
} from '../component/text-area.outline';
import { DefaultFieldLayoutDefinitionOutline } from '../component/default-layout.outline';
import { InlineFieldLayoutDefinitionOutline } from '../component/inline-layout.outline';
import {
  CheckboxInputFieldComponentDefinitionOutline,
  CheckboxInputFieldModelDefinitionOutline,
  CheckboxInputFormComponentDefinitionOutline,
} from '../component/checkbox-input.outline';
import {
  DropdownInputFieldComponentDefinitionOutline,
  DropdownInputFieldModelDefinitionOutline,
  DropdownInputFormComponentDefinitionOutline,
} from '../component/dropdown-input.outline';
import {
  RadioInputFieldComponentDefinitionOutline,
  RadioInputFieldModelDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
} from '../component/radio-input.outline';
import {
  DateInputFieldComponentDefinitionOutline,
  DateInputFieldModelDefinitionOutline,
  DateInputFormComponentDefinitionOutline,
} from '../component/date-input.outline';
import {
  ReusableFieldComponentDefinitionOutline,
  ReusableFormComponentDefinitionOutline,
} from '../component/reusable.outline';
import {
  CheckboxTreeFieldComponentDefinitionOutline,
  CheckboxTreeFieldModelDefinitionOutline,
  CheckboxTreeFormComponentDefinitionOutline,
} from '../component/checkbox-tree.outline';
import {
  TypeaheadInputFieldComponentDefinitionOutline,
  TypeaheadInputFieldModelDefinitionOutline,
  TypeaheadInputFormComponentDefinitionOutline,
} from '../component/typeahead-input.outline';
import {
  RichTextEditorFieldComponentDefinitionOutline,
  RichTextEditorFieldModelDefinitionOutline,
  RichTextEditorFormComponentDefinitionOutline,
} from '../component/rich-text-editor.outline';
import {
  MapFieldComponentDefinitionOutline,
  MapFieldModelDefinitionOutline,
  MapFormComponentDefinitionOutline,
} from '../component/map.outline';
import {
  FileUploadFieldComponentDefinitionOutline,
  FileUploadFieldModelDefinitionOutline,
  FileUploadFormComponentDefinitionOutline,
} from '../component/file-upload.outline';

/**
 * Interface for classes that can be visited by a visitor.
 */
export interface CanVisit {
  /**
   * Accept a visitor to this form field definition.
   */
  accept(visitor: FormConfigVisitorOutline): void;
}

/**
 * Visitors must implement this structure.
 */
export interface FormConfigVisitorOutline {
  visitFormConfig(item: CanVisit): void;

  /* SimpleInput */

  visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void;

  visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void;

  visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void;

  /* Content */

  visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void;

  visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void;

  /* Repeatable  */

  visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void;

  visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void;

  visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void;

  visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void;

  visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void;

  /* Validation Summary */

  visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void;

  visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void;

  /* Group */

  visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void;

  visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void;

  visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void;

  /* Tab  */

  visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void;

  visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void;

  visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void;

  /*  Tab Content */

  visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void;

  visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void;

  visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void;

  /* Save Button  */

  visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void;

  visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void;

  /* Cancel Button  */

  visitCancelButtonFieldComponentDefinition(item: CancelButtonFieldComponentDefinitionOutline): void;

  visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): void;

  /* Tab Nav Button  */

  visitTabNavButtonFieldComponentDefinition(item: TabNavButtonFieldComponentDefinitionOutline): void;

  visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): void;

  /* Text Area */

  visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void;

  visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void;

  visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void;

  /* Default Layout  */

  visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void;

  /* Inline Layout  */

  visitInlineFieldLayoutDefinition(item: InlineFieldLayoutDefinitionOutline): void;

  /* Checkbox Input */

  visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void;

  visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void;

  visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void;

  /* Dropdown Input */

  visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void;

  visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void;

  visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void;

  /* Radio Input */

  visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void;

  visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void;

  visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void;

  /* Date Input */

  visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void;

  visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void;

  visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void;

  /* Reusable */

  visitReusableFieldComponentDefinition(item: ReusableFieldComponentDefinitionOutline): void;

  visitReusableFormComponentDefinition(item: ReusableFormComponentDefinitionOutline): void;

  /* Checkbox Tree */

  visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void;

  visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void;

  visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void;

  /* Typeahead Input */

  visitTypeaheadInputFieldComponentDefinition(item: TypeaheadInputFieldComponentDefinitionOutline): void;

  visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): void;

  visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): void;

  /* Rich Text Editor */

  visitRichTextEditorFieldComponentDefinition(item: RichTextEditorFieldComponentDefinitionOutline): void;

  visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): void;

  visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): void;

  /* Map */

  visitMapFieldComponentDefinition(item: MapFieldComponentDefinitionOutline): void;

  visitMapFieldModelDefinition(item: MapFieldModelDefinitionOutline): void;

  visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): void;

  /* File Upload */

  visitFileUploadFieldComponentDefinition(item: FileUploadFieldComponentDefinitionOutline): void;

  visitFileUploadFieldModelDefinition(item: FileUploadFieldModelDefinitionOutline): void;

  visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): void;
}
