import { FormConfigOutline } from '../form-config.outline';
import { FormConfigVisitorOutline } from './base.outline';
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
} from '../component/group.outline';
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
import { ILogger } from '../../logger.interface';
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
 * The form config visitor definition.
 */
export abstract class FormConfigVisitor implements FormConfigVisitorOutline {
  protected logName = 'FormConfigVisitor';
  protected logger: ILogger;

  protected constructor(logger: ILogger) {
    this.logger = logger;
  }

  /* Form Config */

  async visitFormConfig(item: FormConfigOutline): Promise<void> {
    await this.notImplemented();
  }

  /* SimpleInput */

  async visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Content */

  async visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Repeatable  */

  async visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Validation Summary */

  async visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitSuggestedValidationSummaryFieldComponentDefinition(item: SuggestedValidationSummaryFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitSuggestedValidationSummaryFormComponentDefinition(item: SuggestedValidationSummaryFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Group */

  async visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Tab  */

  async visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Accordion */

  async visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitAccordionFieldLayoutDefinition(item: AccordionFieldLayoutDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitAccordionPanelFieldLayoutDefinition(item: AccordionPanelFieldLayoutDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /*  Tab Content */

  async visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Save Button  */

  async visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitSaveStatusFieldComponentDefinition(item: SaveStatusFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitSaveStatusFormComponentDefinition(item: SaveStatusFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Cancel Button  */

  async visitCancelButtonFieldComponentDefinition(item: CancelButtonFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Delete Button  */

  async visitDeleteButtonFieldComponentDefinition(item: DeleteButtonFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitDeleteButtonFormComponentDefinition(item: DeleteButtonFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Tab Nav Button  */

  async visitTabNavButtonFieldComponentDefinition(item: TabNavButtonFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Text Area */

  async visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Default Layout  */

  async visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Inline Layout  */

  async visitInlineFieldLayoutDefinition(item: InlineFieldLayoutDefinitionOutline): Promise<void> {
    await this.visitDefaultFieldLayoutDefinition(item as any);
  }

  async visitActionRowFieldLayoutDefinition(item: ActionRowFieldLayoutDefinitionOutline): Promise<void> {
    await this.visitDefaultFieldLayoutDefinition(item as any);
  }

  /* Checkbox Input */

  async visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Dropdown Input */

  async visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Radio Input */

  async visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Date Input */

  async visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Reusable */

  async visitReusableFieldComponentDefinition(item: ReusableFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitReusableFormComponentDefinition(item: ReusableFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Question Tree */

  async visitQuestionTreeFieldComponentDefinition(item: QuestionTreeFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitQuestionTreeFieldModelDefinition(item: QuestionTreeFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitQuestionTreeFormComponentDefinition(item: QuestionTreeFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Checkbox Tree */

  async visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Record Selector */

  async visitRecordSelectorFieldComponentDefinition(item: RecordSelectorFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitRecordSelectorFieldModelDefinition(item: RecordSelectorFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitRecordSelectorFormComponentDefinition(item: RecordSelectorFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Typeahead Input */

  async visitTypeaheadInputFieldComponentDefinition(item: TypeaheadInputFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Rich Text Editor */

  async visitRichTextEditorFieldComponentDefinition(item: RichTextEditorFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Map */

  async visitMapFieldComponentDefinition(item: MapFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitMapFieldModelDefinition(item: MapFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* File Upload */

  async visitFileUploadFieldComponentDefinition(item: FileUploadFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitFileUploadFieldModelDefinition(item: FileUploadFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitPDFListFieldComponentDefinition(item: PDFListFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitPDFListFieldModelDefinition(item: PDFListFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitPDFListFormComponentDefinition(item: PDFListFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitRecordMetadataRetrieverFieldComponentDefinition(item: RecordMetadataRetrieverFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitRecordMetadataRetrieverFormComponentDefinition(item: RecordMetadataRetrieverFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Data Location */

  async visitDataLocationFieldComponentDefinition(item: DataLocationFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitDataLocationFieldModelDefinition(item: DataLocationFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitDataLocationFormComponentDefinition(item: DataLocationFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  // Default stubs keep the new component aligned with the rest of the visitor
  // contract until each concrete visitor opts in explicitly.
  async visitPublishDataLocationRefreshFieldComponentDefinition(item: PublishDataLocationRefreshFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitPublishDataLocationRefreshFormComponentDefinition(item: PublishDataLocationRefreshFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitPublishDataLocationSelectorFieldComponentDefinition(item: PublishDataLocationSelectorFieldComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitPublishDataLocationSelectorFieldModelDefinition(item: PublishDataLocationSelectorFieldModelDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  async visitPublishDataLocationSelectorFormComponentDefinition(item: PublishDataLocationSelectorFormComponentDefinitionOutline): Promise<void> {
    await this.notImplemented();
  }

  /* Shared */

  protected async notImplemented() {
    throw new Error(`Visitor method must be implemented.`);
  }
}
