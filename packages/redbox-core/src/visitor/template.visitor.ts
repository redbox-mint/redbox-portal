import { FormConfigVisitor } from '@researchdatabox/sails-ng-common';
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
  start(options: { form: FormConfigOutline }): TemplateCompileInput[] {
    this.formPathHelper.reset();
    this.templates = [];

    options.form.accept(this);
    return this.templates;
  }

  visitFormConfig(item: FormConfigOutline) {
    const behaviours = (item as FormConfigOutline & { behaviours?: FormBehaviourConfigFrame[] }).behaviours;
    this.extractExpressions(item.expressions);
    this.extractBehaviours(behaviours);
    (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      // Visit children
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForFormConfigComponentDefinition(componentDefinition, index)
      );
    });
  }

  /* SimpleInput */

  visitSimpleInputFieldComponentDefinition(_item: SimpleInputFieldComponentDefinitionOutline): void {}

  visitSimpleInputFieldModelDefinition(_item: SimpleInputFieldModelDefinitionOutline): void {}

  visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Content */

  visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
    const template = (item.config?.template ?? '').trim();
    if (template) {
      this.templates?.push({
        key: [...(this.formPathHelper.formPath.formConfig ?? []), 'config', 'template'],
        value: template,
        kind: 'handlebars',
      });
    }
  }

  visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Repeatable  */

  visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
    const componentDefinition = item.config?.elementTemplate;
    if (componentDefinition) {
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForRepeatableFieldComponentDefinition(componentDefinition)
      );
    }
  }

  visitRepeatableFieldModelDefinition(_item: RepeatableFieldModelDefinitionOutline): void {}

  visitRepeatableElementFieldLayoutDefinition(_item: RepeatableElementFieldLayoutDefinitionOutline): void {}

  visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Validation Summary */

  visitValidationSummaryFieldComponentDefinition(_item: ValidationSummaryFieldComponentDefinitionOutline): void {}

  visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  visitSaveStatusFieldComponentDefinition(_item: SaveStatusFieldComponentDefinitionOutline): void {}

  visitSaveStatusFormComponentDefinition(item: SaveStatusFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Group */

  visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
    (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      // Visit children
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForGroupFieldComponentDefinition(componentDefinition, index)
      );
    });
  }

  visitGroupFieldModelDefinition(_item: GroupFieldModelDefinitionOutline): void {}

  visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Tab  */

  visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
    (item.config?.tabs ?? []).forEach((componentDefinition, index) => {
      // Visit children
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForTabFieldComponentDefinition(componentDefinition, index)
      );
    });
  }

  visitTabFieldLayoutDefinition(_item: TabFieldLayoutDefinitionOutline): void {}

  visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Accordion */

  visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): void {
    (item.config?.panels ?? []).forEach((componentDefinition, index) => {
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForAccordionFieldComponentDefinition(componentDefinition, index)
      );
    });
  }

  visitAccordionFieldLayoutDefinition(_item: AccordionFieldLayoutDefinitionOutline): void {}

  visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): void {
    (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForAccordionPanelFieldComponentDefinition(componentDefinition, index)
      );
    });
  }

  visitAccordionPanelFieldLayoutDefinition(_item: AccordionPanelFieldLayoutDefinitionOutline): void {}

  visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /*  Tab Content */

  visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
    (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      // Visit children
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForTabContentFieldComponentDefinition(componentDefinition, index)
      );
    });
  }

  visitTabContentFieldLayoutDefinition(_item: TabContentFieldLayoutDefinitionOutline): void {}

  visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Save Button  */

  visitSaveButtonFieldComponentDefinition(_item: SaveButtonFieldComponentDefinitionOutline): void {}

  visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Cancel Button  */

  visitCancelButtonFieldComponentDefinition(_item: CancelButtonFieldComponentDefinitionOutline): void {}

  visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  visitDeleteButtonFieldComponentDefinition(item: DeleteButtonFieldComponentDefinitionOutline): void {
    const redirectLocation = (item.config?.redirectLocation ?? '').trim();
    if (redirectLocation) {
      this.templates?.push({
        key: [...(this.formPathHelper.formPath.formConfig ?? []), 'config', 'redirectLocation'],
        value: redirectLocation,
        kind: 'handlebars',
      });
    }
  }

  visitDeleteButtonFormComponentDefinition(item: DeleteButtonFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Tab Nav Button  */

  visitTabNavButtonFieldComponentDefinition(_item: TabNavButtonFieldComponentDefinitionOutline): void {}

  visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Text Area */

  visitTextAreaFieldComponentDefinition(_item: TextAreaFieldComponentDefinitionOutline): void {}

  visitTextAreaFieldModelDefinition(_item: TextAreaFieldModelDefinitionOutline): void {}

  visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Default Layout  */

  visitDefaultFieldLayoutDefinition(_item: DefaultFieldLayoutDefinitionOutline): void {}

  /* Checkbox Input */

  visitCheckboxInputFieldComponentDefinition(_item: CheckboxInputFieldComponentDefinitionOutline): void {}

  visitCheckboxInputFieldModelDefinition(_item: CheckboxInputFieldModelDefinitionOutline): void {}

  visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Checkbox Tree */

  visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void {
    const labelTemplate = (item.config?.labelTemplate ?? '').trim();
    if (labelTemplate) {
      this.templates?.push({
        key: [...(this.formPathHelper.formPath.formConfig ?? []), 'config', 'labelTemplate'],
        value: labelTemplate,
        kind: 'handlebars',
      });
    }
  }

  visitCheckboxTreeFieldModelDefinition(_item: CheckboxTreeFieldModelDefinitionOutline): void {}

  visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Record Selector */

  visitRecordSelectorFieldComponentDefinition(_item: RecordSelectorFieldComponentDefinitionOutline): void {}

  visitRecordSelectorFieldModelDefinition(_item: RecordSelectorFieldModelDefinitionOutline): void {}

  visitRecordSelectorFormComponentDefinition(item: RecordSelectorFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Dropdown Input */

  visitDropdownInputFieldComponentDefinition(_item: DropdownInputFieldComponentDefinitionOutline): void {}

  visitDropdownInputFieldModelDefinition(_item: DropdownInputFieldModelDefinitionOutline): void {}

  visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Typeahead Input */

  visitTypeaheadInputFieldComponentDefinition(item: TypeaheadInputFieldComponentDefinitionOutline): void {
    const labelTemplate = (item.config?.labelTemplate ?? '').trim();
    if (labelTemplate) {
      this.templates?.push({
        key: [...(this.formPathHelper.formPath.formConfig ?? []), 'config', 'labelTemplate'],
        value: labelTemplate,
        kind: 'handlebars',
      });
    }
  }

  visitTypeaheadInputFieldModelDefinition(_item: TypeaheadInputFieldModelDefinitionOutline): void {}

  visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Rich Text Editor */

  visitRichTextEditorFieldComponentDefinition(_item: RichTextEditorFieldComponentDefinitionOutline): void {}

  visitRichTextEditorFieldModelDefinition(_item: RichTextEditorFieldModelDefinitionOutline): void {}

  visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Map */

  visitMapFieldComponentDefinition(_item: MapFieldComponentDefinitionOutline): void {}

  visitMapFieldModelDefinition(_item: MapFieldModelDefinitionOutline): void {}

  visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* File Upload */

  visitFileUploadFieldComponentDefinition(_item: FileUploadFieldComponentDefinitionOutline): void {}

  visitFileUploadFieldModelDefinition(_item: FileUploadFieldModelDefinitionOutline): void {}

  visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  visitPDFListFieldComponentDefinition(_item: PDFListFieldComponentDefinitionOutline): void {}

  visitPDFListFieldModelDefinition(_item: PDFListFieldModelDefinitionOutline): void {}

  visitPDFListFormComponentDefinition(item: PDFListFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  visitRecordMetadataRetrieverFieldComponentDefinition(
    _item: RecordMetadataRetrieverFieldComponentDefinitionOutline
  ): void {}

  visitRecordMetadataRetrieverFormComponentDefinition(
    item: RecordMetadataRetrieverFormComponentDefinitionOutline
  ): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Data Location */

  visitDataLocationFieldComponentDefinition(_item: DataLocationFieldComponentDefinitionOutline): void {}

  visitDataLocationFieldModelDefinition(_item: DataLocationFieldModelDefinitionOutline): void {}

  visitDataLocationFormComponentDefinition(item: DataLocationFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  // The refresh trigger has no template-bearing fields of its own.
  visitPublishDataLocationRefreshFieldComponentDefinition(
    _item: PublishDataLocationRefreshFieldComponentDefinitionOutline
  ): void {}

  visitPublishDataLocationRefreshFormComponentDefinition(
    item: PublishDataLocationRefreshFormComponentDefinitionOutline
  ): void {
    this.acceptFormComponentDefinition(item);
  }

  visitPublishDataLocationSelectorFieldComponentDefinition(
    _item: PublishDataLocationSelectorFieldComponentDefinitionOutline
  ): void {}

  visitPublishDataLocationSelectorFieldModelDefinition(
    _item: PublishDataLocationSelectorFieldModelDefinitionOutline
  ): void {}

  visitPublishDataLocationSelectorFormComponentDefinition(
    item: PublishDataLocationSelectorFormComponentDefinitionOutline
  ): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Radio Input */

  visitRadioInputFieldComponentDefinition(_item: RadioInputFieldComponentDefinitionOutline): void {}

  visitRadioInputFieldModelDefinition(_item: RadioInputFieldModelDefinitionOutline): void {}

  visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Date Input */

  visitDateInputFieldComponentDefinition(_item: DateInputFieldComponentDefinitionOutline): void {}

  visitDateInputFieldModelDefinition(_item: DateInputFieldModelDefinitionOutline): void {}

  visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Question Tree */

  visitQuestionTreeFieldComponentDefinition(item: QuestionTreeFieldComponentDefinitionOutline): void {
    (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForQuestionTreeFieldComponentDefinition(componentDefinition, index)
      );
    });
  }

  visitQuestionTreeFieldModelDefinition(_item: QuestionTreeFieldModelDefinitionOutline): void {}

  visitQuestionTreeFormComponentDefinition(item: QuestionTreeFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Shared */

  protected acceptFormComponentDefinition(item: FormComponentDefinitionOutline) {
    this.extractExpressions(item.expressions);
    this.formPathHelper.acceptFormComponentDefinition(item);
  }

  protected extractExpressions(expressions?: FormExpressionsConfigFrame[]): void {
    const extracted: string[] = [];
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
          extracted.push(`${index}-${expression.name}`);
        }
      }
    });
    if (extracted.length > 0) {
      this.logger.debug(`${this.logName}: Extracted ${extracted.length} expressions ${extracted.join(', ')}.`);
    }
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
  protected extractBehaviours(behaviours?: FormBehaviourConfigFrame[]): void {
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
}
