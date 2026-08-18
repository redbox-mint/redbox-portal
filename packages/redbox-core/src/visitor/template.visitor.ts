import { FormConfigVisitor, FormValidatorConfig } from '@researchdatabox/sails-ng-common';
import { FormConfigOutline } from '@researchdatabox/sails-ng-common';
import { TemplateCompileInput } from '@researchdatabox/sails-ng-common';
import {
  SimpleInputFieldComponentDefinitionOutline,
  SimpleInputFieldModelDefinitionOutline,
  SimpleInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  ContentFieldComponentDefinitionOutline,
  ContentFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import { RelatedObjectDataFieldComponentDefinitionOutline, RelatedObjectDataFormComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
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
  IntegrationStatusFieldComponentDefinitionOutline,
  IntegrationStatusFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  WorkspaceFieldComponentDefinitionOutline,
  WorkspaceFormComponentDefinitionOutline,
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
import { FormComponentDefinitionOutline, FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { ILogger } from '@researchdatabox/sails-ng-common';
import { FormPathHelper } from '@researchdatabox/sails-ng-common';
import { FormBehaviourConfigFrame } from '@researchdatabox/sails-ng-common';

/**
 * Visit each form config class type and extract information about any
 * templates that need to be compiled.
 *
 * This is the data allowing templates and expressions to be compiled on the server-side
 * so they can be provided to the client.
 */
export class TemplateFormConfigVisitor extends FormConfigVisitor {
  protected override logName = 'TemplateFormConfigVisitor';

  private formPathHelper: FormPathHelper;

  private templates: TemplateCompileInput[];

  constructor(logger: ILogger) {
    super(logger);
    this.formPathHelper = new FormPathHelper(logger, this);
    this.templates = [];
  }

  /**
   * Start the visitor.
   * @param options Configure the visitor.
   * @param options.form The constructed form.
   */
  async start(options: { form: FormConfigOutline }): Promise<TemplateCompileInput[]> {
    this.formPathHelper.reset();
    this.templates = [];

    await options.form.accept(this);
    return this.templates;
  }

  override async visitFormConfig(item: FormConfigOutline) {
    await this.extractExpressions(item.expressions);
    await this.extractBehaviours(item.behaviours);
    await this.extractValidators(item.validators);
    for (const [index, componentDefinition] of (item?.componentDefinitions ?? []).entries()) {
      // Visit children
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForFormConfigComponentDefinition(componentDefinition, index)
      );
    }
  }

  /* SimpleInput */

  override async visitSimpleInputFieldComponentDefinition(_item: SimpleInputFieldComponentDefinitionOutline): Promise<void> {}

  override async visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Content */

  override async visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): Promise<void> {
    const template = (item.config?.template ?? '').trim();
    if (template) {
      this.templates?.push({
        key: [...(this.formPathHelper.formPath.formConfig ?? []), 'config', 'template'],
        value: template,
        kind: 'handlebars',
      });
    }
  }

  override async visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  override async visitRelatedObjectDataFieldComponentDefinition(item: RelatedObjectDataFieldComponentDefinitionOutline): Promise<void> {
    const template = (item.config?.template ?? '').trim();
    if (template) {
      this.templates?.push({ key: [...(this.formPathHelper.formPath.formConfig ?? []), 'config', 'template'], value: template, kind: 'handlebars' });
    }
  }

  override async visitRelatedObjectDataFormComponentDefinition(item: RelatedObjectDataFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Repeatable  */

  override async visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): Promise<void> {
    const componentDefinition = item.config?.elementTemplate;
    if (componentDefinition) {
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForRepeatableFieldComponentDefinition(componentDefinition)
      );
    }
  }

  override async visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitRepeatableElementFieldLayoutDefinition(
    _item: RepeatableElementFieldLayoutDefinitionOutline
  ): Promise<void> {}

  override async visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Validation Summary */

  override async visitValidationSummaryFieldComponentDefinition(
    _item: ValidationSummaryFieldComponentDefinitionOutline
  ): Promise<void> {}

  override async visitValidationSummaryFormComponentDefinition(
    item: ValidationSummaryFormComponentDefinitionOutline
  ): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  override async visitSuggestedValidationSummaryFieldComponentDefinition(
    _item: SuggestedValidationSummaryFieldComponentDefinitionOutline
  ): Promise<void> {}

  override async visitSuggestedValidationSummaryFormComponentDefinition(
    item: SuggestedValidationSummaryFormComponentDefinitionOutline
  ): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  override async visitSaveStatusFieldComponentDefinition(_item: SaveStatusFieldComponentDefinitionOutline): Promise<void> {}

  override async visitSaveStatusFormComponentDefinition(item: SaveStatusFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Integration Status */

  override async visitIntegrationStatusFieldComponentDefinition(
    _item: IntegrationStatusFieldComponentDefinitionOutline
  ): Promise<void> {}

  override async visitIntegrationStatusFormComponentDefinition(
    item: IntegrationStatusFormComponentDefinitionOutline
  ): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  override async visitWorkspaceFieldComponentDefinition(_item: WorkspaceFieldComponentDefinitionOutline): Promise<void> {}

  override async visitWorkspaceFormComponentDefinition(item: WorkspaceFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Group */

  override async visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
      // Visit children
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForGroupFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  override async visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Tab  */

  override async visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.tabs ?? []).entries()) {
      // Visit children
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForTabFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  override async visitTabFieldLayoutDefinition(_item: TabFieldLayoutDefinitionOutline): Promise<void> {}

  override async visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Accordion */

  override async visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.panels ?? []).entries()) {
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForAccordionFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  override async visitAccordionFieldLayoutDefinition(_item: AccordionFieldLayoutDefinitionOutline): Promise<void> {}

  override async visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  override async visitAccordionPanelFieldComponentDefinition(
    item: AccordionPanelFieldComponentDefinitionOutline
  ): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForAccordionPanelFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  override async visitAccordionPanelFieldLayoutDefinition(_item: AccordionPanelFieldLayoutDefinitionOutline): Promise<void> {}

  override async visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /*  Tab Content */

  override async visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
      // Visit children
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForTabContentFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  override async visitTabContentFieldLayoutDefinition(_item: TabContentFieldLayoutDefinitionOutline): Promise<void> {}

  override async visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Save Button  */

  override async visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): Promise<void> {
    const redirectLocation = (item.config?.redirectLocation ?? '').trim();
    if (redirectLocation) {
      this.templates?.push({
        key: [...(this.formPathHelper.formPath.formConfig ?? []), 'config', 'redirectLocation'],
        value: redirectLocation,
        kind: 'handlebars',
      });
    }
  }

  override async visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Cancel Button  */

  override async visitCancelButtonFieldComponentDefinition(item: CancelButtonFieldComponentDefinitionOutline): Promise<void> {
    const redirectLocation = (item.config?.redirectLocation ?? '').trim();
    if (redirectLocation) {
      this.templates?.push({
        key: [...(this.formPathHelper.formPath.formConfig ?? []), 'config', 'redirectLocation'],
        value: redirectLocation,
        kind: 'handlebars',
      });
    }
  }

  override async visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Delete Button */

  override async visitDeleteButtonFieldComponentDefinition(item: DeleteButtonFieldComponentDefinitionOutline): Promise<void> {
    const redirectLocation = (item.config?.redirectLocation ?? '').trim();
    if (redirectLocation) {
      this.templates?.push({
        key: [...(this.formPathHelper.formPath.formConfig ?? []), 'config', 'redirectLocation'],
        value: redirectLocation,
        kind: 'handlebars',
      });
    }
  }

  override async visitDeleteButtonFormComponentDefinition(item: DeleteButtonFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Tab Nav Button  */

  override async visitTabNavButtonFieldComponentDefinition(_item: TabNavButtonFieldComponentDefinitionOutline): Promise<void> {}

  override async visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Text Area */

  override async visitTextAreaFieldComponentDefinition(_item: TextAreaFieldComponentDefinitionOutline): Promise<void> {}

  override async visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Default Layout  */

  override async visitDefaultFieldLayoutDefinition(_item: DefaultFieldLayoutDefinitionOutline): Promise<void> {}

  /* Checkbox Input */

  override async visitCheckboxInputFieldComponentDefinition(
    _item: CheckboxInputFieldComponentDefinitionOutline
  ): Promise<void> {}

  override async visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Checkbox Tree */

  override async visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): Promise<void> {
    const labelTemplate = (item.config?.labelTemplate ?? '').trim();
    if (labelTemplate) {
      this.templates?.push({
        key: [...(this.formPathHelper.formPath.formConfig ?? []), 'config', 'labelTemplate'],
        value: labelTemplate,
        kind: 'handlebars',
      });
    }
  }

  override async visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Record Selector */

  override async visitRecordSelectorFieldComponentDefinition(
    _item: RecordSelectorFieldComponentDefinitionOutline
  ): Promise<void> {}

  override async visitRecordSelectorFieldModelDefinition(item: RecordSelectorFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitRecordSelectorFormComponentDefinition(item: RecordSelectorFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Dropdown Input */

  override async visitDropdownInputFieldComponentDefinition(
    _item: DropdownInputFieldComponentDefinitionOutline
  ): Promise<void> {}

  override async visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Typeahead Input */

  override async visitTypeaheadInputFieldComponentDefinition(
    item: TypeaheadInputFieldComponentDefinitionOutline
  ): Promise<void> {
    const labelTemplate = (item.config?.labelTemplate ?? '').trim();
    if (labelTemplate) {
      this.templates?.push({
        key: [...(this.formPathHelper.formPath.formConfig ?? []), 'config', 'labelTemplate'],
        value: labelTemplate,
        kind: 'handlebars',
      });
    }
  }

  override async visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Rich Text Editor */

  override async visitRichTextEditorFieldComponentDefinition(
    _item: RichTextEditorFieldComponentDefinitionOutline
  ): Promise<void> {}

  override async visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Map */

  override async visitMapFieldComponentDefinition(_item: MapFieldComponentDefinitionOutline): Promise<void> {}

  override async visitMapFieldModelDefinition(item: MapFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* File Upload */

  override async visitFileUploadFieldComponentDefinition(_item: FileUploadFieldComponentDefinitionOutline): Promise<void> {}

  override async visitFileUploadFieldModelDefinition(item: FileUploadFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  override async visitPDFListFieldComponentDefinition(item: PDFListFieldComponentDefinitionOutline): Promise<void> {
    const fileNameTemplate = (item.config?.fileNameTemplate ?? '').trim();
    if (fileNameTemplate) {
      this.templates?.push({
        key: [...(this.formPathHelper.formPath.formConfig ?? []), 'config', 'fileNameTemplate'],
        value: fileNameTemplate,
        kind: 'handlebars',
      });
    }
  }

  override async visitPDFListFieldModelDefinition(item: PDFListFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitPDFListFormComponentDefinition(item: PDFListFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  override async visitRecordMetadataRetrieverFieldComponentDefinition(
    _item: RecordMetadataRetrieverFieldComponentDefinitionOutline
  ): Promise<void> {}

  override async visitRecordMetadataRetrieverFormComponentDefinition(
    item: RecordMetadataRetrieverFormComponentDefinitionOutline
  ): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Data Location */

  override async visitDataLocationFieldComponentDefinition(_item: DataLocationFieldComponentDefinitionOutline): Promise<void> {}

  override async visitDataLocationFieldModelDefinition(item: DataLocationFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitDataLocationFormComponentDefinition(item: DataLocationFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  // The refresh trigger has no template-bearing fields of its own.
  override async visitPublishDataLocationRefreshFieldComponentDefinition(
    _item: PublishDataLocationRefreshFieldComponentDefinitionOutline
  ): Promise<void> {}

  override async visitPublishDataLocationRefreshFormComponentDefinition(
    item: PublishDataLocationRefreshFormComponentDefinitionOutline
  ): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  override async visitPublishDataLocationSelectorFieldComponentDefinition(
    item: PublishDataLocationSelectorFieldComponentDefinitionOutline
  ): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.headerActions ?? []).entries()) {
      await this.formPathHelper.acceptFormPath(componentDefinition, {
        formConfig: ['config', 'headerActions', index.toString()],
      });
    }
  }

  override async visitPublishDataLocationSelectorFieldModelDefinition(
    item: PublishDataLocationSelectorFieldModelDefinitionOutline
  ): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitPublishDataLocationSelectorFormComponentDefinition(
    item: PublishDataLocationSelectorFormComponentDefinitionOutline
  ): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Radio Input */

  override async visitRadioInputFieldComponentDefinition(_item: RadioInputFieldComponentDefinitionOutline): Promise<void> {}

  override async visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Date Input */

  override async visitDateInputFieldComponentDefinition(_item: DateInputFieldComponentDefinitionOutline): Promise<void> {}

  override async visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Question Tree */

  override async visitQuestionTreeFieldComponentDefinition(item: QuestionTreeFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForQuestionTreeFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  override async visitQuestionTreeFieldModelDefinition(item: QuestionTreeFieldModelDefinitionOutline): Promise<void> {
    await this.extractValidators(item.config?.validators);
  }

  override async visitQuestionTreeFormComponentDefinition(item: QuestionTreeFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Shared */

  protected async acceptFormComponentDefinition(item: FormComponentDefinitionOutline) {
    await this.extractExpressions(item.expressions);
    await this.formPathHelper.acceptFormComponentDefinition(item);
  }

  protected async extractExpressions(expressions?: FormExpressionsConfigFrame[]): Promise<void> {
    (expressions ?? []).forEach((expression, index) => {
      for (const prop of ['template', 'condition'] as const) {
        const config = expression.config as
          | { template?: string; condition?: string; conditionKind?: string }
          | undefined;
        const value = config?.[prop];
        const kind = config?.conditionKind;
        if (kind == 'jsonpointer' && prop == 'condition') {
          // Ignore JSONPointer conditions, no need to compile these
          continue;
        }
        if (value) {
          this.templates?.push({
            key: [...(this.formPathHelper.formPath.formConfig ?? []), 'expressions', index.toString(), 'config', prop],
            value: value,
            kind: 'jsonata',
          });
        }
      }
    });
  }

  /**
   * Extract form-level behaviour templates for server-side compilation.
   *
   * This mirrors `extractExpressions()` but uses top-level behaviour keys rather
   * than component lineage paths. JSONPointer conditions stay inline because the
   * client runtime can evaluate them directly. JSONata-based condition, processor,
   * and action templates are compiled so the raw source can be stripped before
   * the config reaches the browser.
   *
   * v1 scope is intentionally narrow:
   * - processor templates are only read from `jsonataTransform`
   * - action templates cover `valueTemplate` and JSONata `fieldPath`
   * - custom processors/actions are out of scope
   */
  protected async extractBehaviours(behaviours?: FormBehaviourConfigFrame[]): Promise<void> {
    (behaviours ?? []).forEach((behaviour: FormBehaviourConfigFrame, behaviourIndex: number) => {
      const conditionKind = behaviour.conditionKind ?? 'jsonpointer';
      if (behaviour.condition && conditionKind !== 'jsonpointer') {
        this.templates.push({
          key: ['behaviours', behaviourIndex.toString(), 'condition'],
          value: behaviour.condition,
          kind: 'jsonata',
        });
      }

      (behaviour.processors ?? []).forEach((processor: any, processorIndex: number) => {
        const template = processor.config && 'template' in processor.config ? processor.config.template : undefined;
        if (template) {
          this.templates.push({
            key: [
              'behaviours',
              behaviourIndex.toString(),
              'processors',
              processorIndex.toString(),
              'config',
              'template',
            ],
            value: template,
            kind: 'jsonata',
          });
        }
      });

      (
        [
          ['actions', behaviour.actions],
          ['onError', behaviour.onError],
        ] as const
      ).forEach(([listName, actions]) => {
        (actions ?? []).forEach((action: any, actionIndex: number) => {
          const config = action.config as {
            valueTemplate?: string;
            fieldPathKind?: string;
            fieldPath?: string;
          };

          if (typeof config.valueTemplate === 'string') {
            this.templates.push({
              key: [
                'behaviours',
                behaviourIndex.toString(),
                listName,
                actionIndex.toString(),
                'config',
                'valueTemplate',
              ],
              value: config.valueTemplate,
              kind: 'jsonata',
            });
          }

          if (config.fieldPathKind === 'jsonata' && typeof config.fieldPath === 'string') {
            this.templates.push({
              key: ['behaviours', behaviourIndex.toString(), listName, actionIndex.toString(), 'config', 'fieldPath'],
              value: config.fieldPath,
              kind: 'jsonata',
            });
          }
        });
      });
    });
  }

  protected async extractValidators(validators?: FormValidatorConfig[]): Promise<void> {
    (validators ?? []).forEach((validator, index) => {
      if (validator.class === 'jsonata-expression') {
        const value = validator.config?.expression?.toString() ?? '';
        if (value) {
          const parentKey = this.normalizeValidatorTemplateParentKey(this.formPathHelper.formPath.formConfig ?? []);
          const key =
            parentKey.length > 0
              ? [...parentKey, 'config', 'validators', index.toString(), 'config', 'expression']
              : ['validators', index.toString(), 'config', 'expression'];
          this.templates?.push({
            key,
            value: value,
            kind: 'jsonata',
          });
        }
      }
    });
  }

  private normalizeValidatorTemplateParentKey(path: Array<string | number>): Array<string | number> {
    if (path[0] === 'formConfig') {
      return path.slice(1);
    }
    return path;
  }
}
