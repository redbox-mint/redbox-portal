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
  SuggestedValidationSummaryFieldComponentDefinitionOutline,
  SuggestedValidationSummaryFormComponentDefinitionOutline,
} from '../component/suggested-validation-summary.outline';
import {
  GroupFieldComponentDefinitionOutline,
  GroupFieldModelDefinitionOutline,
  GroupFormComponentDefinitionOutline,
} from "../component/group.outline";
import {
  EditTableFieldComponentDefinitionOutline,
  EditTableFieldModelDefinitionOutline,
  EditTableFormComponentDefinitionOutline,
} from '../component/edit-table.outline';
import {
  TabFieldComponentDefinitionOutline,
  TabFieldLayoutDefinitionOutline,
  TabFormComponentDefinitionOutline,
} from '../component/tab.outline';
import {
  AccordionFieldComponentDefinitionOutline,
  AccordionFieldLayoutDefinitionOutline,
  AccordionFormComponentDefinitionOutline,
  AccordionPanelFieldComponentDefinitionOutline,
  AccordionPanelFieldLayoutDefinitionOutline,
  AccordionPanelFormComponentDefinitionOutline,
} from '../component/accordion.outline';
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
  SaveStatusFieldComponentDefinitionOutline,
  SaveStatusFormComponentDefinitionOutline,
} from '../component/save-status.outline';
import {
  CancelButtonFieldComponentDefinitionOutline,
  CancelButtonFormComponentDefinitionOutline,
} from '../component/cancel-button.outline';
import {
  DeleteButtonFieldComponentDefinitionOutline,
  DeleteButtonFormComponentDefinitionOutline,
} from '../component/delete-button.outline';
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
import { ActionRowFieldLayoutDefinitionOutline } from '../component/action-row-layout.outline';
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
  QuestionTreeFieldComponentDefinitionOutline,
  QuestionTreeFieldModelDefinitionOutline,
  QuestionTreeFormComponentDefinitionOutline,
} from '../component/question-tree.outline';
import {
  CheckboxTreeFieldComponentDefinitionOutline,
  CheckboxTreeFieldModelDefinitionOutline,
  CheckboxTreeFormComponentDefinitionOutline,
} from '../component/checkbox-tree.outline';
import {
  RecordSelectorFieldComponentDefinitionOutline,
  RecordSelectorFieldModelDefinitionOutline,
  RecordSelectorFormComponentDefinitionOutline,
} from '../component/record-selector.outline';
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
import {
  PDFListFieldComponentDefinitionOutline,
  PDFListFieldModelDefinitionOutline,
  PDFListFormComponentDefinitionOutline,
} from '../component/pdf-list.outline';
import {
  RecordMetadataRetrieverFieldComponentDefinitionOutline,
  RecordMetadataRetrieverFormComponentDefinitionOutline,
} from '../component/record-metadata-retriever.outline';
import {
  DataLocationFieldComponentDefinitionOutline,
  DataLocationFieldModelDefinitionOutline,
  DataLocationFormComponentDefinitionOutline,
} from '../component/data-location.outline';
import {
  PublishDataLocationSelectorFieldComponentDefinitionOutline,
  PublishDataLocationSelectorFieldModelDefinitionOutline,
  PublishDataLocationSelectorFormComponentDefinitionOutline,
} from '../component/publish-data-location-selector.outline';
import {
  PublishDataLocationRefreshFieldComponentDefinitionOutline,
  PublishDataLocationRefreshFormComponentDefinitionOutline,
} from '../component/publish-data-location-refresh.outline';

/**
 * Interface for classes that can be visited by a visitor.
 */
export interface CanVisit {
  /**
   * Accept a visitor to this form field definition.
   */
  accept(visitor: FormConfigVisitorOutline): Promise<void>;
}

/**
 * Visitors must implement this structure.
 */
export interface FormConfigVisitorOutline {
  visitFormConfig(item: CanVisit): Promise<void>;

  /* SimpleInput */

  visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): Promise<void>;

  visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): Promise<void>;

  visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): Promise<void>;

  /* Content */

  visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): Promise<void>;

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): Promise<void>;

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): Promise<void>;

  /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): Promise<void>;

  visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): Promise<void>;

  visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): Promise<void>;

  visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): Promise<void>;

  /* Validation Summary */

  visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): Promise<void>;

  visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): Promise<void>;

  visitSuggestedValidationSummaryFieldComponentDefinition(item: SuggestedValidationSummaryFieldComponentDefinitionOutline): Promise<void>;

  visitSuggestedValidationSummaryFormComponentDefinition(item: SuggestedValidationSummaryFormComponentDefinitionOutline): Promise<void>;

  /* Group */

  visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): Promise<void>;

  visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): Promise<void>;

  visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void>;

  /* EditTable */

  visitEditTableFieldComponentDefinition(item: EditTableFieldComponentDefinitionOutline): Promise<void>;

  visitEditTableFieldModelDefinition(item: EditTableFieldModelDefinitionOutline): Promise<void>;

  visitEditTableFormComponentDefinition(item: EditTableFormComponentDefinitionOutline): Promise<void>;

  /* Tab  */

  visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): Promise<void>;

  visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): Promise<void>;

  visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): Promise<void>;

  /* Accordion */

  visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): Promise<void>;

  visitAccordionFieldLayoutDefinition(item: AccordionFieldLayoutDefinitionOutline): Promise<void>;

  visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): Promise<void>;

  visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): Promise<void>;

  visitAccordionPanelFieldLayoutDefinition(item: AccordionPanelFieldLayoutDefinitionOutline): Promise<void>;

  visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): Promise<void>;

  /*  Tab Content */

  visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): Promise<void>;

  visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): Promise<void>;

  visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): Promise<void>;

  /* Save Button  */

  visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): Promise<void>;

  visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): Promise<void>;

  /* Save Status  */

  visitSaveStatusFieldComponentDefinition(item: SaveStatusFieldComponentDefinitionOutline): Promise<void>;

  visitSaveStatusFormComponentDefinition(item: SaveStatusFormComponentDefinitionOutline): Promise<void>;

  /* Cancel Button  */

  visitCancelButtonFieldComponentDefinition(item: CancelButtonFieldComponentDefinitionOutline): Promise<void>;

  visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): Promise<void>;

  /* Delete Button  */

  visitDeleteButtonFieldComponentDefinition(item: DeleteButtonFieldComponentDefinitionOutline): Promise<void>;

  visitDeleteButtonFormComponentDefinition(item: DeleteButtonFormComponentDefinitionOutline): Promise<void>;

  /* Tab Nav Button  */

  visitTabNavButtonFieldComponentDefinition(item: TabNavButtonFieldComponentDefinitionOutline): Promise<void>;

  visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): Promise<void>;

  /* Text Area */

  visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): Promise<void>;

  visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): Promise<void>;

  visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): Promise<void>;

  /* Default Layout  */

  visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): Promise<void>;

  /* Inline Layout  */

  visitInlineFieldLayoutDefinition(item: InlineFieldLayoutDefinitionOutline): Promise<void>;

  /* Action Row Layout  */

  visitActionRowFieldLayoutDefinition(item: ActionRowFieldLayoutDefinitionOutline): Promise<void>;

  /* Checkbox Input */

  visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): Promise<void>;

  visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): Promise<void>;

  visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): Promise<void>;

  /* Dropdown Input */

  visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): Promise<void>;

  visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): Promise<void>;

  visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): Promise<void>;

  /* Radio Input */

  visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): Promise<void>;

  visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): Promise<void>;

  visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): Promise<void>;

  /* Date Input */

  visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): Promise<void>;

  visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): Promise<void>;

  visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): Promise<void>;

  /* Reusable */

  visitReusableFieldComponentDefinition(item: ReusableFieldComponentDefinitionOutline): Promise<void>;

  visitReusableFormComponentDefinition(item: ReusableFormComponentDefinitionOutline): Promise<void>;

  /* Question Tree */

  visitQuestionTreeFieldComponentDefinition(item: QuestionTreeFieldComponentDefinitionOutline): Promise<void>;

  visitQuestionTreeFieldModelDefinition(item: QuestionTreeFieldModelDefinitionOutline): Promise<void>;

  visitQuestionTreeFormComponentDefinition(item: QuestionTreeFormComponentDefinitionOutline): Promise<void>;

  /* Checkbox Tree */

  visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): Promise<void>;

  visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): Promise<void>;

  visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): Promise<void>;

  /* Record Selector */

  visitRecordSelectorFieldComponentDefinition(item: RecordSelectorFieldComponentDefinitionOutline): Promise<void>;

  visitRecordSelectorFieldModelDefinition(item: RecordSelectorFieldModelDefinitionOutline): Promise<void>;

  visitRecordSelectorFormComponentDefinition(item: RecordSelectorFormComponentDefinitionOutline): Promise<void>;

  /* Typeahead Input */

  visitTypeaheadInputFieldComponentDefinition(item: TypeaheadInputFieldComponentDefinitionOutline): Promise<void>;

  visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): Promise<void>;

  visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): Promise<void>;

  /* Rich Text Editor */

  visitRichTextEditorFieldComponentDefinition(item: RichTextEditorFieldComponentDefinitionOutline): Promise<void>;

  visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): Promise<void>;

  visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): Promise<void>;

  /* Map */

  visitMapFieldComponentDefinition(item: MapFieldComponentDefinitionOutline): Promise<void>;

  visitMapFieldModelDefinition(item: MapFieldModelDefinitionOutline): Promise<void>;

  visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): Promise<void>;

  /* File Upload */

  visitFileUploadFieldComponentDefinition(item: FileUploadFieldComponentDefinitionOutline): Promise<void>;

  visitFileUploadFieldModelDefinition(item: FileUploadFieldModelDefinitionOutline): Promise<void>;

  visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): Promise<void>;

  /* PDF List */

  visitPDFListFieldComponentDefinition(item: PDFListFieldComponentDefinitionOutline): Promise<void>;

  visitPDFListFieldModelDefinition(item: PDFListFieldModelDefinitionOutline): Promise<void>;

  visitPDFListFormComponentDefinition(item: PDFListFormComponentDefinitionOutline): Promise<void>;

  /* Record Metadata Retriever */

  visitRecordMetadataRetrieverFieldComponentDefinition(item: RecordMetadataRetrieverFieldComponentDefinitionOutline): Promise<void>;

  visitRecordMetadataRetrieverFormComponentDefinition(item: RecordMetadataRetrieverFormComponentDefinitionOutline): Promise<void>;

  /* Data Location */

  visitDataLocationFieldComponentDefinition(item: DataLocationFieldComponentDefinitionOutline): Promise<void>;

  visitDataLocationFieldModelDefinition(item: DataLocationFieldModelDefinitionOutline): Promise<void>;

  visitDataLocationFormComponentDefinition(item: DataLocationFormComponentDefinitionOutline): Promise<void>;

  // Refresh trigger gets dedicated visitor hooks because it is component-only
  // and should never be mistaken for a normal field+model pair.
  visitPublishDataLocationRefreshFieldComponentDefinition(item: PublishDataLocationRefreshFieldComponentDefinitionOutline): Promise<void>;

  visitPublishDataLocationRefreshFormComponentDefinition(item: PublishDataLocationRefreshFormComponentDefinitionOutline): Promise<void>;

  visitPublishDataLocationSelectorFieldComponentDefinition(item: PublishDataLocationSelectorFieldComponentDefinitionOutline): Promise<void>;

  visitPublishDataLocationSelectorFieldModelDefinition(item: PublishDataLocationSelectorFieldModelDefinitionOutline): Promise<void>;

  visitPublishDataLocationSelectorFormComponentDefinition(item: PublishDataLocationSelectorFormComponentDefinitionOutline): Promise<void>;

}
