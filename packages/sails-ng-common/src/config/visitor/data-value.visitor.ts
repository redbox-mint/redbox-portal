import { FormConfigVisitor } from "./base.model";
import { FormConfigOutline } from "../form-config.outline";
import { set as _set } from "lodash";
import {
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelDefinitionOutline,
    SimpleInputFormComponentDefinitionOutline
} from "../component/simple-input.outline";
import {
    ContentFieldComponentDefinitionOutline,
    ContentFormComponentDefinitionOutline
} from "../component/content.outline";
import {
    RepeatableElementFieldLayoutDefinitionOutline,
    RepeatableFieldComponentDefinitionOutline,
    RepeatableFieldModelDefinitionOutline,
    RepeatableFormComponentDefinitionOutline,
} from "../component/repeatable.outline";
import {
    ValidationSummaryFieldComponentDefinitionOutline,
    ValidationSummaryFormComponentDefinitionOutline
} from "../component/validation-summary.outline";
import {
    GroupFieldComponentDefinitionOutline,
    GroupFieldModelDefinitionOutline,
    GroupFormComponentDefinitionOutline
} from "../component/group.outline";
import {
    TabFieldComponentDefinitionOutline,
    TabFieldLayoutDefinitionOutline,
    TabFormComponentDefinitionOutline
} from "../component/tab.outline";
import {
    TabContentFieldComponentDefinitionOutline,
    TabContentFieldLayoutDefinitionOutline,
    TabContentFormComponentDefinitionOutline
} from "../component/tab-content.outline";
import {
    SaveButtonFieldComponentDefinitionOutline,
    SaveButtonFormComponentDefinitionOutline
} from "../component/save-button.outline";
import {
    TextAreaFieldComponentDefinitionOutline,
    TextAreaFieldModelDefinitionOutline,
    TextAreaFormComponentDefinitionOutline
} from "../component/text-area.outline";
import { DefaultFieldLayoutDefinitionOutline } from "../component/default-layout.outline";
import {
    CheckboxInputFieldComponentDefinitionOutline,
    CheckboxInputFieldModelDefinitionOutline,
    CheckboxInputFormComponentDefinitionOutline
} from "../component/checkbox-input.outline";
import {
    CheckboxTreeFieldComponentDefinitionOutline,
    CheckboxTreeFieldModelDefinitionOutline,
    CheckboxTreeFormComponentDefinitionOutline
} from "../component/checkbox-tree.outline";
import {
    DropdownInputFieldComponentDefinitionOutline,
    DropdownInputFieldModelDefinitionOutline,
    DropdownInputFormComponentDefinitionOutline
} from "../component/dropdown-input.outline";
import {
    TypeaheadInputFieldComponentDefinitionOutline,
    TypeaheadInputFieldModelDefinitionOutline,
    TypeaheadInputFormComponentDefinitionOutline
} from "../component/typeahead-input.outline";
import {
    RichTextEditorFieldComponentDefinitionOutline,
    RichTextEditorFieldModelDefinitionOutline,
    RichTextEditorFormComponentDefinitionOutline
} from "../component/rich-text-editor.outline";
import {
    MapFieldComponentDefinitionOutline,
    MapFieldModelDefinitionOutline,
    MapFormComponentDefinitionOutline
} from "../component/map.outline";
import {
    FileUploadFieldComponentDefinitionOutline,
    FileUploadFieldModelDefinitionOutline,
    FileUploadFormComponentDefinitionOutline
} from "../component/file-upload.outline";
import {
    RadioInputFieldComponentDefinitionOutline,
    RadioInputFieldModelDefinitionOutline,
    RadioInputFormComponentDefinitionOutline
} from "../component/radio-input.outline";
import {
    DateInputFieldComponentDefinitionOutline,
    DateInputFieldModelDefinitionOutline,
    DateInputFormComponentDefinitionOutline
} from "../component/date-input.outline";
import { FormComponentDefinitionOutline } from "../form-component.outline";
import { FieldModelDefinitionFrame } from "../field-model.outline";
import { ILogger } from "../../logger.interface";
import { FormConfig } from "../form-config.model";
import { FormPathHelper } from "./common.model";

/**
 * Visit each form config component and extract the value for each field.
 *
 * This is used for to create a record data model structure from a form config.
 *
 * Each component definition is a property, where the key is the name and the value is the model value.
 */
export class DataValueFormConfigVisitor extends FormConfigVisitor {
    protected override logName = "DataValueFormConfigVisitor";

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
     * Start the visitor.
     * @param options Configure the visitor.
     * @param options.form The constructed form.
     */
    start(options: { form: FormConfigOutline }): Record<string, unknown> {
        this.formPathHelper.reset();

        this.dataValues = {};

        this.formConfig = options.form;
        this.formConfig.accept(this);

        return this.dataValues;
    }

    /* Form Config */

    visitFormConfig(item: FormConfigOutline): void {
        (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.formPathHelper.acceptFormPath(
                componentDefinition,
                this.formPathHelper.lineagePathsForFormConfigComponentDefinition(componentDefinition, index),
            );
        });
    }

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        // The value in the elementTemplate is the value for *new* items,
        // no new array elements are created as part of the data value visitor.
        // So, don't process the element template.
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.formPathHelper.acceptFormPath(
                componentDefinition,
                this.formPathHelper.lineagePathsForGroupFieldComponentDefinition(componentDefinition, index),
            );
        });
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        (item.config?.tabs ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.formPathHelper.acceptFormPath(
                componentDefinition,
                this.formPathHelper.lineagePathsForTabFieldComponentDefinition(componentDefinition, index),
            );
        });
    }

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
    }

    visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /*  Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
        (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.formPathHelper.acceptFormPath(
                componentDefinition,
                this.formPathHelper.lineagePathsForTabContentFieldComponentDefinition(componentDefinition, index),
            );
        });
    }

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
    }

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
    }

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
    }

    /* Checkbox Input */

    visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
    }

    visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Checkbox Tree */

    visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void {
    }

    visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Typeahead Input */

    visitTypeaheadInputFieldComponentDefinition(item: TypeaheadInputFieldComponentDefinitionOutline): void {
    }

    visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Rich Text Editor */

    visitRichTextEditorFieldComponentDefinition(item: RichTextEditorFieldComponentDefinitionOutline): void {
    }

    visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Map */

    visitMapFieldComponentDefinition(item: MapFieldComponentDefinitionOutline): void {
    }

    visitMapFieldModelDefinition(item: MapFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* File Upload */

    visitFileUploadFieldComponentDefinition(item: FileUploadFieldComponentDefinitionOutline): void {
    }

    visitFileUploadFieldModelDefinition(item: FileUploadFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinition(item);
    }

    /* Shared */

    /**
     * Set the value for the form component when visiting the model definition.
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

    protected acceptFormComponentDefinition(item: FormComponentDefinitionOutline) {
        this.formPathHelper.acceptFormComponentDefinition(item);
    }
}
