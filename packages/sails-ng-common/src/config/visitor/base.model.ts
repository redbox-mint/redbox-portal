import {FormConfigOutline} from "../form-config.outline";
import {FormConfigVisitorOutline} from "./base.outline";
import {
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelDefinitionOutline,
    SimpleInputFormComponentDefinitionOutline,
} from "../component/simpleinput.outline";
import {
    ContentFieldComponentDefinitionOutline,
    ContentFormComponentDefinitionOutline,
} from "../component/textblock.outline";
import {
    RepeatableElementFieldLayoutDefinitionOutline,
    RepeatableFieldComponentDefinitionOutline,
    RepeatableFieldModelDefinitionOutline,
    RepeatableFormComponentDefinitionOutline,
} from "../component/repeatable.outline";
import {
    ValidationSummaryFieldComponentDefinitionOutline,
    ValidationSummaryFormComponentDefinitionOutline,
} from "../component/validation-summary.outline";
import {
    GroupFieldComponentDefinitionOutline,
    GroupFieldModelDefinitionOutline,
    GroupFormComponentDefinitionOutline,
} from "../component/group.outline";
import {
    TabFieldComponentDefinitionOutline,
    TabFieldLayoutDefinitionOutline,
    TabFormComponentDefinitionOutline,
} from "../component/tab.outline";
import {
    TabContentFieldComponentDefinitionOutline,
    TabContentFieldLayoutDefinitionOutline,
    TabContentFormComponentDefinitionOutline,
} from "../component/tab-content.outline";
import {
    SaveButtonFieldComponentDefinitionOutline,
    SaveButtonFormComponentDefinitionOutline,
} from "../component/save-button.outline";
import {
    TextAreaFieldComponentDefinitionOutline,
    TextAreaFieldModelDefinitionOutline,
    TextAreaFormComponentDefinitionOutline,
} from "../component/textarea.outline";
import {
    DefaultFieldLayoutDefinitionOutline,
} from "../component/default-layout.outline";
import {
    CheckboxInputFieldComponentDefinitionOutline,
    CheckboxInputFieldModelDefinitionOutline, CheckboxInputFormComponentDefinitionOutline
} from "../component/checkbox-input.outline";
import {
    DropdownInputFieldComponentDefinitionOutline,
    DropdownInputFieldModelDefinitionOutline, DropdownInputFormComponentDefinitionOutline
} from "../component/dropdown-input.outline";
import {
    RadioInputFieldComponentDefinitionOutline,
    RadioInputFieldModelDefinitionOutline, RadioInputFormComponentDefinitionOutline
} from "../component/radio-input.outline";


/**
 * The form config visitor definition.
 */
export abstract class FormConfigVisitor implements FormConfigVisitorOutline {

    visitFormConfig(item: FormConfigOutline): void {
        this.notImplemented('visitFormConfig');
    }

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
        this.notImplemented('visitSimpleInputFieldComponentDefinition');
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
        this.notImplemented('visitSimpleInputFieldModelDefinition');
    }

    visitSimpleInputFormComponentDefinition(param: SimpleInputFormComponentDefinitionOutline): void {
        this.notImplemented('visitSimpleInputFormComponentDefinition');
    }

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
        this.notImplemented('visitContentFieldComponentDefinition');
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        this.notImplemented('visitContentFormComponentDefinition');
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        this.notImplemented('visitRepeatableFieldComponentDefinition');
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        this.notImplemented('visitRepeatableFieldModelDefinition');
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
        this.notImplemented('visitRepeatableElementFieldLayoutDefinition');
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        this.notImplemented('visitRepeatableFormComponentDefinition');
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
        this.notImplemented('visitValidationSummaryFieldComponentDefinition');
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
        this.notImplemented('visitValidationSummaryFormComponentDefinition');
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        this.notImplemented('visitGroupFieldComponentDefinition');
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        this.notImplemented('visitGroupFieldModelDefinition');
    }

    visitGroupFormComponentDefinition(param: GroupFormComponentDefinitionOutline): void {
        this.notImplemented('visitGroupFormComponentDefinition');
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        this.notImplemented('visitTabFieldComponentDefinition');
    }

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
        this.notImplemented('visitTabFieldLayoutDefinition');
    }

    visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
        this.notImplemented('visitTabFormComponentDefinition');
    }

    /*  Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
        this.notImplemented('visitTabContentFieldComponentDefinition');
    }

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
        this.notImplemented('visitTabContentFieldLayoutDefinition');
    }

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
        this.notImplemented('visitTabContentFormComponentDefinition');
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
        this.notImplemented('visitSaveButtonFieldComponentDefinition');
    }

    visitSaveButtonFormComponentDefinition(param: SaveButtonFormComponentDefinitionOutline): void {
        this.notImplemented('visitSaveButtonFormComponentDefinition');
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
        this.notImplemented('visitTextAreaFieldComponentDefinition');
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
        this.notImplemented('visitTextAreaFieldModelDefinition');
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        this.notImplemented('visitTextAreaFormComponentDefinition');
    }

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
        this.notImplemented('visitDefaultFieldLayoutDefinition');
    }

    /* Checkbox Input */

    visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
        this.notImplemented('visitCheckboxInputFieldComponentDefinition');
    }

    visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
        this.notImplemented('visitCheckboxInputFieldModelDefinition');
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
        this.notImplemented('visitCheckboxInputFormComponentDefinition');
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
        this.notImplemented('visitDropdownInputFieldComponentDefinition');
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
        this.notImplemented('visitDropdownInputFieldModelDefinition');
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        this.notImplemented('visitDropdownInputFormComponentDefinition');
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
        this.notImplemented('visitRadioInputFieldComponentDefinition');
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
        this.notImplemented('visitRadioInputFieldModelDefinition');
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        this.notImplemented('visitRadioInputFormComponentDefinition');
    }

    protected notImplemented(name: string) {
        throw new Error(`Method '${name}' is not implemented.`);
    }
}