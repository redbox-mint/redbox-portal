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
 * The form config visitor definition.
 */
export abstract class FormConfigVisitor implements FormConfigVisitorOutline {
  protected logName = 'FormConfigVisitor';
  protected logger: ILogger;

  protected constructor(logger: ILogger) {
    this.logger = logger;
  }

  /* Form Config */

  visitFormConfig(item: FormConfigOutline): void {
    this.notImplemented();
  }

  /* SimpleInput */

  visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
    this.notImplemented();
  }

  visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Content */

  visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Repeatable  */

  visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
    this.notImplemented();
  }

  visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
    this.notImplemented();
  }

  visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Validation Summary */

  visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Group */

  visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
    this.notImplemented();
  }

  visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Tab  */

  visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
    this.notImplemented();
  }

  visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Accordion */

  visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitAccordionFieldLayoutDefinition(item: AccordionFieldLayoutDefinitionOutline): void {
    this.notImplemented();
  }

  visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitAccordionPanelFieldLayoutDefinition(item: AccordionPanelFieldLayoutDefinitionOutline): void {
    this.notImplemented();
  }

  visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /*  Tab Content */

  visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
    this.notImplemented();
  }

  visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Save Button  */

  visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Cancel Button  */

  visitCancelButtonFieldComponentDefinition(item: CancelButtonFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Tab Nav Button  */

  visitTabNavButtonFieldComponentDefinition(item: TabNavButtonFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Text Area */

  visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
    this.notImplemented();
  }

  visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Default Layout  */

  visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
    this.notImplemented();
  }

  /* Inline Layout  */

  visitInlineFieldLayoutDefinition(item: InlineFieldLayoutDefinitionOutline): void {
    this.visitDefaultFieldLayoutDefinition(item as any);
  }

  /* Checkbox Input */

  visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
    this.notImplemented();
  }

  visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Dropdown Input */

  visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
    this.notImplemented();
  }

  visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Radio Input */

  visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
    this.notImplemented();
  }

  visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Date Input */

  visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
    this.notImplemented();
  }

  visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Reusable */

  visitReusableFieldComponentDefinition(item: ReusableFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitReusableFormComponentDefinition(item: ReusableFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Checkbox Tree */

  visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void {
    this.notImplemented();
  }

  visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Typeahead Input */

  visitTypeaheadInputFieldComponentDefinition(item: TypeaheadInputFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): void {
    this.notImplemented();
  }

  visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Rich Text Editor */

  visitRichTextEditorFieldComponentDefinition(item: RichTextEditorFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): void {
    this.notImplemented();
  }

  visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Map */

  visitMapFieldComponentDefinition(item: MapFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitMapFieldModelDefinition(item: MapFieldModelDefinitionOutline): void {
    this.notImplemented();
  }

  visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* File Upload */

  visitFileUploadFieldComponentDefinition(item: FileUploadFieldComponentDefinitionOutline): void {
    this.notImplemented();
  }

  visitFileUploadFieldModelDefinition(item: FileUploadFieldModelDefinitionOutline): void {
    this.notImplemented();
  }

  visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): void {
    this.notImplemented();
  }

  /* Shared */

  protected notImplemented() {
    throw new Error(`Visitor method must be implemented.`);
  }
}
