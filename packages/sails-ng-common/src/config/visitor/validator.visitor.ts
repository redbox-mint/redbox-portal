import { FormConfigVisitor } from './base.model';
import {
  FormValidatorConfig,
  FormValidatorControl,
  FormValidatorDefinition,
  FormValidatorSummaryErrors,
  SimpleServerFormValidatorControl,
} from '../../validation/form.model';
import { FormConfigOutline } from '../form-config.outline';
import { ILogger } from '../../logger.interface';
import {
  SimpleInputFieldComponentDefinitionOutline,
  SimpleInputFieldModelDefinitionOutline,
  SimpleInputFormComponentDefinitionOutline,
} from '../component/simple-input.outline';
import { guessType } from '../helpers';
import { FormComponentDefinitionOutline } from '../form-component.outline';
import { ValidatorsSupport } from '../../validation/validators-support';
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
import {
  CheckboxInputFieldComponentDefinitionOutline,
  CheckboxInputFieldModelDefinitionOutline,
  CheckboxInputFormComponentDefinitionOutline,
} from '../component/checkbox-input.outline';
import {
  CheckboxTreeFieldComponentDefinitionOutline,
  CheckboxTreeFieldModelDefinitionOutline,
  CheckboxTreeFormComponentDefinitionOutline,
} from '../component/checkbox-tree.outline';
import {
  DropdownInputFieldComponentDefinitionOutline,
  DropdownInputFieldModelDefinitionOutline,
  DropdownInputFormComponentDefinitionOutline,
} from '../component/dropdown-input.outline';
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
  MapDrawingMode,
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
  RadioInputFieldComponentDefinitionOutline,
  RadioInputFieldModelDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
} from '../component/radio-input.outline';
import {
  DateInputFieldComponentDefinitionOutline,
  DateInputFieldModelDefinitionOutline,
  DateInputFormComponentDefinitionOutline,
} from '../component/date-input.outline';
import { FormConfig } from '../form-config.model';
import { FormPathHelper } from './common.model';
import { DataValueFormConfigVisitor } from './data-value.visitor';
import { buildLineagePaths } from '../names/naming-helpers';

/**
 * Visit each form config component and run its validators.
 *
 * This visitor is for the server-side.
 * On the client, use the standard angular component validator methods.
 *
 * By default, all validators are run: ['all'].
 * Specify which validators are run by providing enabledValidationGroups.
 */
export class ValidatorFormConfigVisitor extends FormConfigVisitor {
  private validatorSupport: ValidatorsSupport;

  private form: FormConfigOutline;
  private enabledValidationGroups: string[];
  private validatorDefinitionsMap: Map<string, FormValidatorDefinition>;

  private validationErrors: FormValidatorSummaryErrors[];

  private formPathHelper: FormPathHelper;

  constructor(logger: ILogger) {
    super(logger);

    this.validatorSupport = new ValidatorsSupport();

    this.form = new FormConfig();
    this.enabledValidationGroups = [];
    this.validatorDefinitionsMap = new Map<string, FormValidatorDefinition>();

    this.validationErrors = [];

    this.formPathHelper = new FormPathHelper(logger, this);
  }

  /**
   * Start the visitor.
   * @param options Configure the visitor.
   * @param options.form The constructed form.
   * @param options.enabledValidationGroups The validation groups to enable.
   * @param options.validatorDefinitions The validation definitions to make available.
   */
  start(options: {
    form: FormConfigOutline;
    enabledValidationGroups?: string[];
    validatorDefinitions?: FormValidatorDefinition[];
  }): FormValidatorSummaryErrors[] {
    this.formPathHelper.reset();

    this.form = options.form;

    // use the first non-null, non-undefined value - empty array is a valid value
    this.enabledValidationGroups = options.enabledValidationGroups ?? this.form.enabledValidationGroups ?? ['all'];
    this.validatorDefinitionsMap = this.validatorSupport.createValidatorDefinitionMapping(
      options.validatorDefinitions || []
    );

    this.validationErrors = [];

    this.form.accept(this);

    return this.validationErrors;
  }

  /* Form Config */

  visitFormConfig(item: FormConfigOutline): void {
    (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      // Visit children
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForFormConfigComponentDefinition(componentDefinition, index)
      );
    });

    // Run form-level validators using the full form data model.
    // There are various reasons a validator is at form level, e.g. they involve more than one field.
    const dataValueVisitor = new DataValueFormConfigVisitor(this.logger);
    const value = dataValueVisitor.start({ form: item });
    const itemName = item?.name ?? '';
    this.validationErrors.push(...this.validateFormComponent(itemName, value, item?.validators));
  }

  /* SimpleInput */

  visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void { }

  visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void { }

  visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Content */

  visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void { }

  visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Repeatable  */

  visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void { }

  visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void { }

  visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void { }

  visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Validation Summary */

  visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void { }

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

  visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void { }

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

  visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void { }

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

  visitAccordionFieldLayoutDefinition(item: AccordionFieldLayoutDefinitionOutline): void { }

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

  visitAccordionPanelFieldLayoutDefinition(item: AccordionPanelFieldLayoutDefinitionOutline): void { }

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

  visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void { }

  visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Save Button  */

  visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void { }

  visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Cancel Button  */

  visitCancelButtonFieldComponentDefinition(item: CancelButtonFieldComponentDefinitionOutline): void { }

  visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Tab Nav Button  */

  visitTabNavButtonFieldComponentDefinition(item: TabNavButtonFieldComponentDefinitionOutline): void { }

  visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Text Area */

  visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void { }

  visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void { }

  visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Default Layout  */

  visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void { }

  /* Checkbox Input */

  visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void { }

  visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void { }

  visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Checkbox Tree */

  visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void { }

  visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void { }

  visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Dropdown Input */

  visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void { }

  visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void { }

  visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Typeahead Input */

  visitTypeaheadInputFieldComponentDefinition(item: TypeaheadInputFieldComponentDefinitionOutline): void {
    const configErrors: FormValidatorSummaryErrors['errors'] = [];
    const config = item.config;
    const sourceType = config?.sourceType;

    if (!sourceType || !['static', 'vocabulary', 'namedQuery'].includes(sourceType)) {
      configErrors.push({
        class: 'typeaheadSourceType',
        message: '@validator-error-typeahead-source-type',
        params: { sourceType },
      });
    }

    if (sourceType === 'static' && (!Array.isArray(config?.staticOptions) || config.staticOptions.length === 0)) {
      configErrors.push({
        class: 'typeaheadStaticOptions',
        message: '@validator-error-typeahead-static-options',
        params: { sourceType },
      });
    }
    if (sourceType === 'vocabulary' && !String(config?.vocabRef ?? '').trim()) {
      configErrors.push({
        class: 'typeaheadVocabRef',
        message: '@validator-error-typeahead-vocab-ref',
        params: { sourceType },
      });
    }
    if (sourceType === 'namedQuery' && !String(config?.queryId ?? '').trim()) {
      configErrors.push({
        class: 'typeaheadQueryId',
        message: '@validator-error-typeahead-query-id',
        params: { sourceType },
      });
    }
    if (config?.multiSelect === true) {
      configErrors.push({
        class: 'typeaheadMultiSelect',
        message: '@validator-error-typeahead-multi-select-unsupported',
        params: { multiSelect: true },
      });
    }

    if (configErrors.length > 0) {
      this.validationErrors.push({
        id: String(
          this.formPathHelper.formPath.angularComponents?.[this.formPathHelper.formPath.angularComponents.length - 1] ??
          ''
        ),
        message: item?.config?.label ?? 'TypeaheadInput configuration',
        errors: configErrors,
        lineagePaths: buildLineagePaths(this.formPathHelper.formPath),
      });
    }
  }

  visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): void { }

  visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Rich Text Editor */

  visitRichTextEditorFieldComponentDefinition(item: RichTextEditorFieldComponentDefinitionOutline): void { }

  visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): void { }

  visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Map */

  visitMapFieldComponentDefinition(item: MapFieldComponentDefinitionOutline): void {
    const configErrors: FormValidatorSummaryErrors['errors'] = [];
    const enabledModes = Array.isArray(item.config?.enabledModes) ? item.config?.enabledModes : [];
    const validModes: MapDrawingMode[] = ['point', 'polygon', 'linestring', 'rectangle', 'select'];
    const invalidModes = enabledModes.filter(mode => !validModes.includes(mode));
    if (invalidModes.length > 0) {
      configErrors.push({
        class: 'mapEnabledModes',
        message: '@validator-error-map-enabled-modes',
        params: { invalidModes },
      });
    }
    if (configErrors.length > 0) {
      this.validationErrors.push({
        id: String(
          this.formPathHelper.formPath.angularComponents?.[this.formPathHelper.formPath.angularComponents.length - 1] ??
          ''
        ),
        message: item?.config?.label ?? 'MapComponent configuration',
        errors: configErrors,
        lineagePaths: buildLineagePaths(this.formPathHelper.formPath),
      });
    }
  }

  visitMapFieldModelDefinition(item: MapFieldModelDefinitionOutline): void { }

  visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* File Upload */

  visitFileUploadFieldComponentDefinition(item: FileUploadFieldComponentDefinitionOutline): void { }

  visitFileUploadFieldModelDefinition(item: FileUploadFieldModelDefinitionOutline): void { }

  visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Radio Input */

  visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void { }

  visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void { }

  visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Date Input */

  visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void { }

  visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void { }

  visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Shared */

  protected createFormControlFromRecordValue(recordValue: unknown): FormValidatorControl {
    const guessedType = guessType(recordValue);
    let result;
    if (guessedType === 'object') {
      result = new SimpleServerFormValidatorControl(
        Object.fromEntries(
          Object.entries(recordValue as Record<string, unknown>).map(([key, value]) => [
            key,
            this.createFormControlFromRecordValue(value),
          ])
        )
      );
    } else if (guessedType === 'array') {
      result = new SimpleServerFormValidatorControl(
        (recordValue as Array<unknown>).map(i => this.createFormControlFromRecordValue(i))
      );
    } else {
      result = new SimpleServerFormValidatorControl(recordValue);
    }
    return result;
  }

  protected acceptFormComponentDefinition(item: FormComponentDefinitionOutline) {
    const validationErrors = this.validateFormComponent(
      item?.name,
      item?.model?.config?.value,
      item?.model?.config?.validators,
      item?.layout?.config?.label
    );
    this.validationErrors.push(...validationErrors);
    this.formPathHelper.acceptFormComponentDefinition(item);
  }

  protected validateFormComponent(
    itemName: string,
    value: any,
    validators?: FormValidatorConfig[],
    message?: string
  ): FormValidatorSummaryErrors[] {
    const availableValidatorGroups = this.form?.validationGroups ?? {};
    const result: FormValidatorSummaryErrors[] = [];
    if (Array.isArray(validators) && validators.length > 0) {
      const filteredValidators = this.validatorSupport.enabledValidators(
        availableValidatorGroups,
        this.enabledValidationGroups,
        validators
      );
      const formValidatorFns = this.validatorSupport.createFormValidatorInstancesFromMapping(
        this.validatorDefinitionsMap,
        filteredValidators
      );
      const recordFormControl = this.createFormControlFromRecordValue(value);
      const summaryErrors: FormValidatorSummaryErrors = {
        id: itemName,
        message: message || null,
        errors: [],
        lineagePaths: buildLineagePaths(this.formPathHelper.formPath),
      };
      for (const formValidatorFn of formValidatorFns) {
        const funcResult = formValidatorFn(recordFormControl);
        const compErrors = this.validatorSupport.getFormValidatorComponentErrors(funcResult);
        summaryErrors.errors.push(...compErrors);
      }
      if (summaryErrors.errors.length > 0) {
        result.push(summaryErrors);
      }
    }

    return result;
  }
}
