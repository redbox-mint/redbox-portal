import { FormConfigVisitor } from './base.model';
import { FormConfigOutline } from '../form-config.outline';
import { set as _set } from 'lodash';
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
  RepeatableModelName,
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
import { guessType } from '../helpers';
import { FieldModelDefinitionFrame } from '../field-model.outline';
import { FormComponentDefinitionOutline } from '../form-component.outline';
import { ILogger } from '../../logger.interface';
import { CanVisit } from './base.outline';
import { FormPathHelper } from './common.model';
import { LineagePath, LineagePathsPartial } from '../names/naming-helpers';import {
    QuestionTreeFieldComponentDefinitionOutline,
    QuestionTreeFieldModelDefinitionOutline, QuestionTreeFormComponentDefinitionOutline
} from "../component/question-tree.outline";

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
  start(options: { form: FormConfigOutline }): Record<string, unknown> {
    this.jsonTypeDefPath = [];
    this.jsonTypeDef = {};
    this.typeaheadValueModesByJsonPath = new Map<string, 'value' | 'optionObject'>();
    this.formPathHelper.reset();

    options.form.accept(this);
    return this.jsonTypeDef;
  }

  /* Form Config */

  visitFormConfig(item: FormConfigOutline): void {
    (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      // Visit children
      this.acceptJsonTypeDefPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForFormConfigComponentDefinition(componentDefinition, index),
        ['properties']
      );
    });
  }

  /* SimpleInput */

  visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {}

  visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
    this.setFromModelDefinition(item);
  }

  visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Content */

  visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {}

  visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Repeatable  */

  visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
    const componentDefinition = item.config?.elementTemplate;
    if (componentDefinition) {
      this.acceptJsonTypeDefPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForRepeatableFieldComponentDefinition(componentDefinition),
        ['elements']
      );
    }
  }

  visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
    // Build the json type def from the component instead of model for repeatable.
    // Need to visit nested components to build the correct structure.
    // this.setFromModelDefinition(item);
  }

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
      this.acceptJsonTypeDefPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForGroupFieldComponentDefinition(componentDefinition, index),
        ['properties']
      );
    });
  }

  visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
    // Build the json type def from the component instead of model for group.
    // Need to visit nested components to build the correct structure.
    // this.setFromModelDefinition(item);
  }

  visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Tab  */

  visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
    (item.config?.tabs ?? []).forEach((componentDefinition, index) => {
      // Visit children
      this.acceptJsonTypeDefPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForTabFieldComponentDefinition(componentDefinition, index)
      );
    });
  }

  visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {}

  visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /*  Tab Content */

  visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
    (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      // Visit children
      this.acceptJsonTypeDefPath(
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

  visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
    this.setFromModelDefinition(item);
  }

  visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Default Layout  */

  visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {}

  /* Checkbox Input */

  visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {}

  visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
    this.setFromModelDefinition(item);
  }

  visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Checkbox Tree */

  visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void {}

  visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void {
    this.setFromModelDefinition(item);
  }

  visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Dropdown Input */

  visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {}

  visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
    this.setFromModelDefinition(item);
  }

  visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Typeahead Input */

  visitTypeaheadInputFieldComponentDefinition(item: TypeaheadInputFieldComponentDefinitionOutline): void {
    const jsonPathKey = this.jsonTypeDefPath.join('/');
    this.typeaheadValueModesByJsonPath.set(
      jsonPathKey,
      item.config?.valueMode === 'optionObject' ? 'optionObject' : 'value'
    );
  }

  visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): void {
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

  visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Rich Text Editor */

  visitRichTextEditorFieldComponentDefinition(item: RichTextEditorFieldComponentDefinitionOutline): void {}

  visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): void {
    this.setFromModelDefinition(item);
  }

  visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Map */

  visitMapFieldComponentDefinition(item: MapFieldComponentDefinitionOutline): void {}

  visitMapFieldModelDefinition(item: MapFieldModelDefinitionOutline): void {
    _set(this.jsonTypeDef, this.jsonTypeDefPath, {
      type: 'object',
    });
  }

  visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* File Upload */

  visitFileUploadFieldComponentDefinition(item: FileUploadFieldComponentDefinitionOutline): void {}

  visitFileUploadFieldModelDefinition(item: FileUploadFieldModelDefinitionOutline): void {
    _set(this.jsonTypeDef, this.jsonTypeDefPath, {
      elements: {
        type: 'object',
      },
    });
  }

  visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Radio Input */

  visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {}

  visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
    this.setFromModelDefinition(item);
  }

  visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

  /* Date Input */

  visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {}

  visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
    this.setFromModelDefinition(item);
  }

  visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
    this.acceptFormComponentDefinition(item);
  }

    /* Question Tree */

    visitQuestionTreeFieldComponentDefinition(item: QuestionTreeFieldComponentDefinitionOutline): void {
      (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
        // Visit children
        this.acceptJsonTypeDefPath(
          componentDefinition,
          this.formPathHelper.lineagePathsForQuestionTreeFieldComponentDefinition(componentDefinition, index),
          ['properties']
        );
      });
    }

    visitQuestionTreeFieldModelDefinition(item: QuestionTreeFieldModelDefinitionOutline): void {
      // Visit nested components to build the correct structure.
      // this.setFromModelDefinition(item);
    }

    visitQuestionTreeFormComponentDefinition(item: QuestionTreeFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

  /* Shared */

  protected setFromModelDefinition(item: FieldModelDefinitionFrame<unknown>) {
    // TODO: What if there is no model value set? Each component has an associated data type / data model structure.
    //       It would probably be better to use the component data structure knowledge instead of guessing the optional
    //       model value.
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
  protected acceptFormComponentDefinition(item: FormComponentDefinitionOutline) {
    const jsonTypeDefPathKeys = item.model && item.name ? [item.name] : [];

    this.acceptJsonTypeDefPath(item.component, { formConfig: ['component'] }, jsonTypeDefPathKeys);
    if (item.model) {
      this.acceptJsonTypeDefPath(item.model, { formConfig: ['model'] }, jsonTypeDefPathKeys);
    }
    if (item.layout) {
      this.acceptJsonTypeDefPath(item.layout, { formConfig: ['layout'] }, jsonTypeDefPathKeys);
    }
  }

  protected acceptJsonTypeDefPath(item: CanVisit, more: LineagePathsPartial, jsonTypeDefPathKeys?: LineagePath): void {
    const originalPath = [...this.jsonTypeDefPath];
    try {
      this.jsonTypeDefPath = [...originalPath, ...(jsonTypeDefPathKeys ?? [])];
      this.formPathHelper.acceptFormPath(item, more);
    } catch (error) {
      throw error;
    } finally {
      this.jsonTypeDefPath = originalPath;
    }
  }
}
