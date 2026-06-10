import { FormConfigVisitor } from '@researchdatabox/sails-ng-common';
import { FormConfigOutline } from '@researchdatabox/sails-ng-common';
import { set as _set } from 'lodash';
import {
  SimpleInputFieldComponentDefinitionOutline,
  SimpleInputFieldModelDefinitionOutline,
  SimpleInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  ContentFieldComponentDefinitionOutline,
  ContentFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  RepeatableElementFieldLayoutDefinitionOutline,
  RepeatableFieldComponentDefinitionOutline,
  RepeatableFieldModelDefinitionOutline,
  RepeatableFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  ValidationSummaryFieldComponentDefinitionOutline,
  ValidationSummaryFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  SuggestedValidationSummaryFieldComponentDefinitionOutline,
  SuggestedValidationSummaryFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  SaveStatusFieldComponentDefinitionOutline,
  SaveStatusFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  GroupFieldComponentDefinitionOutline,
  GroupFieldModelDefinitionOutline,
  GroupFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  EditTableFieldComponentDefinitionOutline,
  EditTableFieldModelDefinitionOutline,
  EditTableFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  TabFieldComponentDefinitionOutline,
  TabFieldLayoutDefinitionOutline,
  TabFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  AccordionFieldComponentDefinitionOutline,
  AccordionFieldLayoutDefinitionOutline,
  AccordionFormComponentDefinitionOutline,
  AccordionPanelFieldComponentDefinitionOutline,
  AccordionPanelFieldLayoutDefinitionOutline,
  AccordionPanelFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  TabContentFieldComponentDefinitionOutline,
  TabContentFieldLayoutDefinitionOutline,
  TabContentFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  SaveButtonFieldComponentDefinitionOutline,
  SaveButtonFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  CancelButtonFieldComponentDefinitionOutline,
  CancelButtonFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  DeleteButtonFieldComponentDefinitionOutline,
  DeleteButtonFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  TabNavButtonFieldComponentDefinitionOutline,
  TabNavButtonFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  TextAreaFieldComponentDefinitionOutline,
  TextAreaFieldModelDefinitionOutline,
  TextAreaFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import { DefaultFieldLayoutDefinitionOutline } from '@researchdatabox/sails-ng-common';
import {
  CheckboxInputFieldComponentDefinitionOutline,
  CheckboxInputFieldModelDefinitionOutline,
  CheckboxInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  CheckboxTreeFieldComponentDefinitionOutline,
  CheckboxTreeFieldModelDefinitionOutline,
  CheckboxTreeFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  RecordSelectorFieldComponentDefinitionOutline,
  RecordSelectorFieldModelDefinitionOutline,
  RecordSelectorFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  DropdownInputFieldComponentDefinitionOutline,
  DropdownInputFieldModelDefinitionOutline,
  DropdownInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  TypeaheadInputFieldComponentDefinitionOutline,
  TypeaheadInputFieldModelDefinitionOutline,
  TypeaheadInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  RichTextEditorFieldComponentDefinitionOutline,
  RichTextEditorFieldModelDefinitionOutline,
  RichTextEditorFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  MapFieldComponentDefinitionOutline,
  MapFieldModelDefinitionOutline,
  MapFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  FileUploadFieldComponentDefinitionOutline,
  FileUploadFieldModelDefinitionOutline,
  FileUploadFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  PDFListFieldComponentDefinitionOutline,
  PDFListFieldModelDefinitionOutline,
  PDFListFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  RecordMetadataRetrieverFieldComponentDefinitionOutline,
  RecordMetadataRetrieverFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  DataLocationFieldComponentDefinitionOutline,
  DataLocationFieldModelDefinitionOutline,
  DataLocationFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  PublishDataLocationRefreshFieldComponentDefinitionOutline,
  PublishDataLocationRefreshFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  PublishDataLocationSelectorFieldComponentDefinitionOutline,
  PublishDataLocationSelectorFieldModelDefinitionOutline,
  PublishDataLocationSelectorFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  RadioInputFieldComponentDefinitionOutline,
  RadioInputFieldModelDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  DateInputFieldComponentDefinitionOutline,
  DateInputFieldModelDefinitionOutline,
  DateInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  QuestionTreeFieldComponentDefinitionOutline,
  QuestionTreeFieldModelDefinitionOutline,
  QuestionTreeFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import { FormComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
import { FieldModelDefinitionFrame } from '@researchdatabox/sails-ng-common';
import { ILogger } from '@researchdatabox/sails-ng-common';
import { FormConfig } from '@researchdatabox/sails-ng-common';
import { FormPathHelper } from '@researchdatabox/sails-ng-common';

/**
 async * Visit each form config component and extract the value for each field.
 *
 * This is used for to create a record data model structure from a form config.
 *
 * Each component definition is a property, where the key is the name and the value is the model value.
 */
export class DataValueFormConfigVisitor extends FormConfigVisitor {
  protected override logName = 'DataValueFormConfigVisitor';

  private dataValues: Record<string, unknown>;

  private formConfig: FormConfigOutline;

  private formPathHelper: FormPathHelper;

  constructor(logger: ILogger) {
    super(logger);

    this.dataValues = {};

    this.formConfig = new FormConfig();

    this.formPathHelper = new FormPathHelper(logger, this);
  }

  /**
   async * Start the visitor.
   async * @param options Configure the visitor.
   * @param options.form The constructed form.
   */
  async start(options: { form: FormConfigOutline }): Promise<Record<string, unknown>> {
    this.formPathHelper.reset();

    this.dataValues = {};

    this.formConfig = options.form;
    await this.formConfig.accept(this);

    return this.dataValues;
  }

  /* Form Config */

  async visitFormConfig(item: FormConfigOutline): Promise<void> {
    for (const [index, componentDefinition] of (item?.componentDefinitions ?? []).entries()) {
      // Visit children
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForFormConfigComponentDefinition(componentDefinition, index)
      );
    }
  }

  /* SimpleInput */

  async visitSimpleInputFieldComponentDefinition(_item: SimpleInputFieldComponentDefinitionOutline): Promise<void> { }

  async visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Content */

  async visitContentFieldComponentDefinition(_item: ContentFieldComponentDefinitionOutline): Promise<void> { }

  async visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Repeatable  */

  async visitRepeatableFieldComponentDefinition(_item: RepeatableFieldComponentDefinitionOutline): Promise<void> {
    // The value in the elementTemplate is the value for *new* items,
    // no new array elements are created as part of the data value visitor.
    // So, don't process the element template.
  }

  async visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitRepeatableElementFieldLayoutDefinition(_item: RepeatableElementFieldLayoutDefinitionOutline): Promise<void> { }

  async visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Validation Summary */

  async visitValidationSummaryFieldComponentDefinition(_item: ValidationSummaryFieldComponentDefinitionOutline): Promise<void> { }

  async visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitSuggestedValidationSummaryFieldComponentDefinition(_item: SuggestedValidationSummaryFieldComponentDefinitionOutline): Promise<void> { }

  async visitSuggestedValidationSummaryFormComponentDefinition(item: SuggestedValidationSummaryFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitSaveStatusFieldComponentDefinition(_item: SaveStatusFieldComponentDefinitionOutline): Promise<void> { }

  async visitSaveStatusFormComponentDefinition(item: SaveStatusFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Group */

  async visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
      // Visit children
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForGroupFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  async visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* EditTable */

  async visitEditTableFieldComponentDefinition(_item: EditTableFieldComponentDefinitionOutline): Promise<void> {
    // The componentDefinitions are a template for the add/edit dialog sub-form,
    // the row values live in the model's array value.
    // So, don't process the dialog sub-form components.
  }

  async visitEditTableFieldModelDefinition(item: EditTableFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitEditTableFormComponentDefinition(item: EditTableFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Tab  */

  async visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.tabs ?? []).entries()) {
      // Visit children
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForTabFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  async visitTabFieldLayoutDefinition(_item: TabFieldLayoutDefinitionOutline): Promise<void> { }

  async visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Accordion */

  async visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.panels ?? []).entries()) {
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForAccordionFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  async visitAccordionFieldLayoutDefinition(_item: AccordionFieldLayoutDefinitionOutline): Promise<void> { }

  async visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForAccordionPanelFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  async visitAccordionPanelFieldLayoutDefinition(_item: AccordionPanelFieldLayoutDefinitionOutline): Promise<void> { }

  async visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /*  Tab Content */

  async visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
      // Visit children
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForTabContentFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  async visitTabContentFieldLayoutDefinition(_item: TabContentFieldLayoutDefinitionOutline): Promise<void> { }

  async visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Save Button  */

  async visitSaveButtonFieldComponentDefinition(_item: SaveButtonFieldComponentDefinitionOutline): Promise<void> { }

  async visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Cancel Button  */

  async visitCancelButtonFieldComponentDefinition(_item: CancelButtonFieldComponentDefinitionOutline): Promise<void> { }

  async visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitDeleteButtonFieldComponentDefinition(_item: DeleteButtonFieldComponentDefinitionOutline): Promise<void> { }

  async visitDeleteButtonFormComponentDefinition(item: DeleteButtonFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Tab Nav Button  */

  async visitTabNavButtonFieldComponentDefinition(_item: TabNavButtonFieldComponentDefinitionOutline): Promise<void> { }

  async visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Text Area */

  async visitTextAreaFieldComponentDefinition(_item: TextAreaFieldComponentDefinitionOutline): Promise<void> { }

  async visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Default Layout  */

  async visitDefaultFieldLayoutDefinition(_item: DefaultFieldLayoutDefinitionOutline): Promise<void> { }

  /* Checkbox Input */

  async visitCheckboxInputFieldComponentDefinition(_item: CheckboxInputFieldComponentDefinitionOutline): Promise<void> { }

  async visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Checkbox Tree */

  async visitCheckboxTreeFieldComponentDefinition(_item: CheckboxTreeFieldComponentDefinitionOutline): Promise<void> { }

  async visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Record Selector */

  async visitRecordSelectorFieldComponentDefinition(_item: RecordSelectorFieldComponentDefinitionOutline): Promise<void> { }

  async visitRecordSelectorFieldModelDefinition(item: RecordSelectorFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitRecordSelectorFormComponentDefinition(item: RecordSelectorFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Dropdown Input */

  async visitDropdownInputFieldComponentDefinition(_item: DropdownInputFieldComponentDefinitionOutline): Promise<void> { }

  async visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Typeahead Input */

  async visitTypeaheadInputFieldComponentDefinition(_item: TypeaheadInputFieldComponentDefinitionOutline): Promise<void> { }

  async visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Rich Text Editor */

  async visitRichTextEditorFieldComponentDefinition(_item: RichTextEditorFieldComponentDefinitionOutline): Promise<void> { }

  async visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Map */

  async visitMapFieldComponentDefinition(_item: MapFieldComponentDefinitionOutline): Promise<void> { }

  async visitMapFieldModelDefinition(item: MapFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* File Upload */

  async visitFileUploadFieldComponentDefinition(_item: FileUploadFieldComponentDefinitionOutline): Promise<void> { }

  async visitFileUploadFieldModelDefinition(item: FileUploadFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitPDFListFieldComponentDefinition(_item: PDFListFieldComponentDefinitionOutline): Promise<void> { }

  async visitPDFListFieldModelDefinition(item: PDFListFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitPDFListFormComponentDefinition(item: PDFListFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitRecordMetadataRetrieverFieldComponentDefinition(_item: RecordMetadataRetrieverFieldComponentDefinitionOutline): Promise<void> { }

  async visitRecordMetadataRetrieverFormComponentDefinition(item: RecordMetadataRetrieverFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Data Location */

  async visitDataLocationFieldComponentDefinition(_item: DataLocationFieldComponentDefinitionOutline): Promise<void> { }

  async visitDataLocationFieldModelDefinition(item: DataLocationFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitDataLocationFormComponentDefinition(item: DataLocationFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  // No stored field value exists for the refresh trigger, so the data-value
  // visitor deliberately leaves it as a no-op.
  async visitPublishDataLocationRefreshFieldComponentDefinition(_item: PublishDataLocationRefreshFieldComponentDefinitionOutline): Promise<void> { }

  async visitPublishDataLocationRefreshFormComponentDefinition(item: PublishDataLocationRefreshFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitPublishDataLocationSelectorFieldComponentDefinition(_item: PublishDataLocationSelectorFieldComponentDefinitionOutline): Promise<void> { }

  async visitPublishDataLocationSelectorFieldModelDefinition(item: PublishDataLocationSelectorFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitPublishDataLocationSelectorFormComponentDefinition(item: PublishDataLocationSelectorFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Radio Input */

  async visitRadioInputFieldComponentDefinition(_item: RadioInputFieldComponentDefinitionOutline): Promise<void> { }

  async visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Date Input */

  async visitDateInputFieldComponentDefinition(_item: DateInputFieldComponentDefinitionOutline): Promise<void> { }

  async visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Question Tree */

  async visitQuestionTreeFieldComponentDefinition(item: QuestionTreeFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForQuestionTreeFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  async visitQuestionTreeFieldModelDefinition(item: QuestionTreeFieldModelDefinitionOutline): Promise<void> {
    this.setFromModelDefinition(item);
  }

  async visitQuestionTreeFormComponentDefinition(item: QuestionTreeFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Shared */

  /**
   async * Set the value for the form component when visiting the model definition.
   *
   * Some components might have data values in other places (e.g. ContentComponent component.config.content).
   * This is currently not included in the built data value structure.
   *
   * There may be future uses cases for extracting data values from places other than the model.config.value.
   *
   * @param item The field model definition.
   * @protected
   */
  protected setFromModelDefinition(item: FieldModelDefinitionFrame<unknown>) {
    const dataModelPath = this.formPathHelper.formPath.dataModel;
    if (item?.config?.value !== undefined) {
      _set(this.dataValues, dataModelPath, item?.config?.value);
    }
  }

  protected async acceptFormComponentDefinition(item: FormComponentDefinitionOutline) {
    await this.formPathHelper.acceptFormComponentDefinition(item);
  }
}
