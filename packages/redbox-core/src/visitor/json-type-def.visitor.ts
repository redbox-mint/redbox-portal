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
  RepeatableModelName,
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
import { guessType } from '@researchdatabox/sails-ng-common';
import { FieldModelDefinitionFrame } from '@researchdatabox/sails-ng-common';
import { FormComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
import { ILogger } from '@researchdatabox/sails-ng-common';
import { CanVisit } from '@researchdatabox/sails-ng-common';
import { FormPathHelper } from '@researchdatabox/sails-ng-common';
import { LineagePath, LineagePathsPartial } from '@researchdatabox/sails-ng-common';

/**
 * Visit each form config class type to build the JSON TypeDef schema that represents the form config.
 *
 * One use for this is to enable merging two records.
 */
export class JsonTypeDefSchemaFormConfigVisitor extends FormConfigVisitor {
  protected override logName = 'JsonTypeDefSchemaFormConfigVisitor';

  private jsonTypeDefPath: LineagePath;
  private jsonTypeDef: Record<string, unknown>;
  private typeaheadValueModesByJsonPath: Map<string, 'value' | 'optionObject'>;
  private formPathHelper: FormPathHelper;

  constructor(logger: ILogger) {
    super(logger);
    this.jsonTypeDefPath = [];
    this.jsonTypeDef = {};
    this.typeaheadValueModesByJsonPath = new Map<string, 'value' | 'optionObject'>();
    this.formPathHelper = new FormPathHelper(logger, this);
  }

  /**
   * Start the visitor.
   * @param options Configure the visitor.
   * @param options.form The constructed form.
   */
  async start(options: { form: FormConfigOutline }): Promise<Record<string, unknown>> {
    this.jsonTypeDefPath = [];
    this.jsonTypeDef = {};
    this.typeaheadValueModesByJsonPath = new Map<string, 'value' | 'optionObject'>();
    this.formPathHelper.reset();

    await options.form.accept(this);
    return this.jsonTypeDef;
  }

  /* Form Config */

  async visitFormConfig(item: FormConfigOutline): Promise<void> {
    for (const [index, componentDefinition] of (item?.componentDefinitions ?? []).entries()) {
      // Visit children
      await this.acceptJsonTypeDefPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForFormConfigComponentDefinition(componentDefinition, index),
        ['properties']
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

  async visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): Promise<void> {
    const componentDefinition = item.config?.elementTemplate;
    if (componentDefinition) {
      await this.acceptJsonTypeDefPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForRepeatableFieldComponentDefinition(componentDefinition),
        ['elements']
      );
    }
  }

  async visitRepeatableFieldModelDefinition(_item: RepeatableFieldModelDefinitionOutline): Promise<void> {
    // Build the json type def from the component instead of model for repeatable.
    // Need to visit nested components to build the correct structure.
    // this.setFromModelDefinition(item);
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
      await this.acceptJsonTypeDefPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForGroupFieldComponentDefinition(componentDefinition, index),
        ['properties']
      );
    }
  }

  async visitGroupFieldModelDefinition(_item: GroupFieldModelDefinitionOutline): Promise<void> {
    // Build the json type def from the component instead of model for group.
    // Need to visit nested components to build the correct structure.
    // this.setFromModelDefinition(item);
  }

  async visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Tab  */

  async visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.tabs ?? []).entries()) {
      // Visit children
      await this.acceptJsonTypeDefPath(
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
      await this.acceptJsonTypeDefPath(
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
      await this.acceptJsonTypeDefPath(
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
      await this.acceptJsonTypeDefPath(
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

  async visitRecordSelectorFieldModelDefinition(_item: RecordSelectorFieldModelDefinitionOutline): Promise<void> {
    _set(this.jsonTypeDef, this.jsonTypeDefPath, {
      properties: {
        oid: { type: 'string' },
      },
      optionalProperties: {
        title: { type: 'string' },
      },
    });
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

  async visitTypeaheadInputFieldComponentDefinition(item: TypeaheadInputFieldComponentDefinitionOutline): Promise<void> {
    const jsonPathKey = this.jsonTypeDefPath.join('/');
    this.typeaheadValueModesByJsonPath.set(
      jsonPathKey,
      item.config?.valueMode === 'optionObject' ? 'optionObject' : 'value'
    );
  }

  async visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): Promise<void> {
    const jsonPathKey = this.jsonTypeDefPath.join('/');
    const valueMode = this.typeaheadValueModesByJsonPath.get(jsonPathKey) ?? 'value';
    if (valueMode === 'optionObject') {
      _set(this.jsonTypeDef, this.jsonTypeDefPath, {
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
        },
        optionalProperties: {
          sourceType: { type: 'string' },
        },
      });
      return;
    }
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

  async visitMapFieldModelDefinition(_item: MapFieldModelDefinitionOutline): Promise<void> {
    _set(this.jsonTypeDef, this.jsonTypeDefPath, {
      type: 'object',
    });
  }

  async visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* File Upload */

  async visitFileUploadFieldComponentDefinition(_item: FileUploadFieldComponentDefinitionOutline): Promise<void> { }

  async visitFileUploadFieldModelDefinition(_item: FileUploadFieldModelDefinitionOutline): Promise<void> {
    _set(this.jsonTypeDef, this.jsonTypeDefPath, {
      elements: {
        type: 'object',
      },
    });
  }

  async visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitPDFListFieldComponentDefinition(_item: PDFListFieldComponentDefinitionOutline): Promise<void> { }

  async visitPDFListFieldModelDefinition(_item: PDFListFieldModelDefinitionOutline): Promise<void> {
    _set(this.jsonTypeDef, this.jsonTypeDefPath, {
      elements: {
        type: 'object',
      },
    });
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

  async visitDataLocationFieldModelDefinition(_item: DataLocationFieldModelDefinitionOutline): Promise<void> {
    _set(this.jsonTypeDef, this.jsonTypeDefPath, {
      elements: {
        type: 'object',
      },
    });
  }

  async visitDataLocationFormComponentDefinition(item: DataLocationFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  // The refresh trigger contributes no persisted JSON schema because it does not
  // write a value into form data.
  async visitPublishDataLocationRefreshFieldComponentDefinition(_item: PublishDataLocationRefreshFieldComponentDefinitionOutline): Promise<void> { }

  async visitPublishDataLocationRefreshFormComponentDefinition(item: PublishDataLocationRefreshFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitPublishDataLocationSelectorFieldComponentDefinition(_item: PublishDataLocationSelectorFieldComponentDefinitionOutline): Promise<void> { }

  async visitPublishDataLocationSelectorFieldModelDefinition(_item: PublishDataLocationSelectorFieldModelDefinitionOutline): Promise<void> {
    _set(this.jsonTypeDef, this.jsonTypeDefPath, {
      elements: {
        type: 'object',
      },
    });
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
      await this.acceptJsonTypeDefPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForQuestionTreeFieldComponentDefinition(componentDefinition, index),
        ['properties']
      );
    }
  }

  async visitQuestionTreeFieldModelDefinition(_item: QuestionTreeFieldModelDefinitionOutline): Promise<void> {
    // Visit nested components to build the correct structure.
  }

  async visitQuestionTreeFormComponentDefinition(item: QuestionTreeFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Shared */

  protected setFromModelDefinition(item: FieldModelDefinitionFrame<unknown>) {
    const value = item?.config?.value;

    // default to a type of string
    let guessedType = 'string';

    if (value !== undefined) {
      if (item?.class === RepeatableModelName) {
        if (Array.isArray(value) && value.length > 0) {
          guessedType = guessType(value[0]);
        } else {
          guessedType = 'string';
        }
      } else {
        guessedType = guessType(value);
      }
    }
    // type: https://jsontypedef.com/docs/jtd-in-5-minutes/#type-schemas
    _set(this.jsonTypeDef, this.jsonTypeDefPath, { type: guessedType });
  }

  /**
   * Call accept on the properties of the form component definition outline that can be visited.
   * @param item The form component definition outline.
   * @protected
   */
  protected async acceptFormComponentDefinition(item: FormComponentDefinitionOutline) {
    const jsonTypeDefPathKeys = item.model && item.name ? [item.name] : [];

    await this.acceptJsonTypeDefPath(item.component, {formConfig: ['component']}, jsonTypeDefPathKeys);
    if (item.model) {
      await this.acceptJsonTypeDefPath(item.model, {formConfig: ['model']}, jsonTypeDefPathKeys);
    }
    if (item.layout) {
      await this.acceptJsonTypeDefPath(item.layout, {formConfig: ['layout']}, jsonTypeDefPathKeys);
    }
  }

  protected async acceptJsonTypeDefPath(item: CanVisit, more: LineagePathsPartial, jsonTypeDefPathKeys?: LineagePath): Promise<void> {
    const originalPath = [...this.jsonTypeDefPath];
    try {
      this.jsonTypeDefPath = [...originalPath, ...(jsonTypeDefPathKeys ?? [])];
      await this.formPathHelper.acceptFormPath(item, more);
    } finally {
      this.jsonTypeDefPath = originalPath;
    }
  }
}
