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
  RadioInputFieldComponentDefinitionOutline,
  RadioInputFieldModelDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  DateInputFieldComponentDefinitionOutline,
  DateInputFieldModelDefinitionOutline,
  DateInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import { FormComponentDefinitionOutline, FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { ILogger } from '@researchdatabox/sails-ng-common';
import { FormPathHelper } from '@researchdatabox/sails-ng-common';

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
    this.extractExpressions(item.expressions);
    (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      // Visit children
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForFormConfigComponentDefinition(componentDefinition, index)
      );
    });
  }

  /* SimpleInput */

  visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {}

  visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {}

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

  visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {}

  visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {}

  visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Validation Summary */

  visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {}

  visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
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

  visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {}

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

  visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {}

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

  visitAccordionFieldLayoutDefinition(item: AccordionFieldLayoutDefinitionOutline): void {}

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

  visitAccordionPanelFieldLayoutDefinition(item: AccordionPanelFieldLayoutDefinitionOutline): void {}

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

  visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {}

  visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Save Button  */

  visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {}

  visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Cancel Button  */

  visitCancelButtonFieldComponentDefinition(item: CancelButtonFieldComponentDefinitionOutline): void {}

  visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Tab Nav Button  */

  visitTabNavButtonFieldComponentDefinition(item: TabNavButtonFieldComponentDefinitionOutline): void {}

  visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Text Area */

  visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {}

  visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {}

  visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Default Layout  */

  visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {}

  /* Checkbox Input */

  visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {}

  visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {}

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

  visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void {}

  visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Dropdown Input */

  visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {}

  visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {}

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

  visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): void {}

  visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Rich Text Editor */

  visitRichTextEditorFieldComponentDefinition(item: RichTextEditorFieldComponentDefinitionOutline): void {}

  visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): void {}

  visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Map */

  visitMapFieldComponentDefinition(item: MapFieldComponentDefinitionOutline): void {}

  visitMapFieldModelDefinition(item: MapFieldModelDefinitionOutline): void {}

  visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* File Upload */

  visitFileUploadFieldComponentDefinition(item: FileUploadFieldComponentDefinitionOutline): void {}

  visitFileUploadFieldModelDefinition(item: FileUploadFieldModelDefinitionOutline): void {}

  visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Radio Input */

  visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {}

  visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {}

  visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Date Input */

  visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {}

  visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {}

  visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
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
        const value = (expression.config as any)?.[prop];
        const kind = (expression.config as any)?.['conditionKind'];
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
}
