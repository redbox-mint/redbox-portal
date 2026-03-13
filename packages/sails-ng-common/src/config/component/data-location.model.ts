import { FieldModelConfig, FieldModelDefinition } from "../field-model.model";
import { FormComponentDefinition } from "../form-component.model";
import { FormConfigVisitorOutline } from "../visitor/base.outline";
import {
    FieldComponentConfigKind,
    FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind,
    FormComponentDefinitionKind
} from "../shared.outline";
import { FieldComponentConfig, FieldComponentDefinition } from "../field-component.model";
import { AvailableFieldLayoutDefinitionOutlines } from "../dictionary.outline";
import {
    DataLocationComponentName,
    DataLocationFieldComponentConfigOutline,
    DataLocationFieldComponentDefinitionOutline,
    DataLocationFieldModelConfigOutline,
    DataLocationFieldModelDefinitionOutline,
    DataLocationFormComponentDefinitionOutline,
    DataLocationModelName,
    DataLocationModelValueType,
    DataLocationOption,
    DataLocationValueType
} from "./data-location.outline";
import { FileUploadSourceType } from "./file-upload.outline";

export class DataLocationFieldComponentConfig extends FieldComponentConfig implements DataLocationFieldComponentConfigOutline {
    restrictions?: Record<string, unknown>;
    enabledSources: FileUploadSourceType[] = [];
    companionUrl?: string;
    allowUploadWithoutSave = false;
    uppyDashboardNote = "Maximum upload size: 1 Gb per file";
    tusHeaders?: Record<string, string>;
    notesEnabled = true;
    iscEnabled = false;
    iscHeader = "Information Security Classification";
    defaultSelect = "confidential";
    securityClassificationOptions: DataLocationOption[] = [];
    locationAddText = "";
    typeHeader = "Type";
    locationHeader = "Location";
    notesHeader = "Notes";
    columns: string[] | Record<string, unknown>[] = [];
    editNotesButtonText = "Edit";
    editNotesTitle = "Edit Notes";
    cancelEditNotesButtonText = "Cancel";
    applyEditNotesButtonText = "Apply";
    editNotesCssClasses = "form-control";
    dataTypes: DataLocationOption[] = [
        { label: "URL", value: "url" },
        { label: "Physical location", value: "physical" },
        { label: "File path", value: "file" },
        { label: "Attachment", value: "attachment" }
    ];
    dataTypeLookup: Record<string, string> = {
        url: "URL",
        physical: "Physical location",
        file: "File path",
        attachment: "Attachment"
    };
    hideNotesForLocationTypes: string[] = [];
}

export class DataLocationFieldComponentDefinition extends FieldComponentDefinition implements DataLocationFieldComponentDefinitionOutline {
    class = DataLocationComponentName;
    config?: DataLocationFieldComponentConfigOutline;

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitDataLocationFieldComponentDefinition(this);
    }
}

export class DataLocationFieldModelConfig extends FieldModelConfig<DataLocationModelValueType> implements DataLocationFieldModelConfigOutline {
    defaultValue: DataLocationValueType[];

    constructor() {
        super();
        this.defaultValue = [];
    }
}

export class DataLocationFieldModelDefinition extends FieldModelDefinition<DataLocationModelValueType> implements DataLocationFieldModelDefinitionOutline {
    class = DataLocationModelName;
    config?: DataLocationFieldModelConfigOutline;

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitDataLocationFieldModelDefinition(this);
    }
}

export class DataLocationFormComponentDefinition extends FormComponentDefinition implements DataLocationFormComponentDefinitionOutline {
    public component!: DataLocationFieldComponentDefinitionOutline;
    public model?: DataLocationFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitDataLocationFormComponentDefinition(this);
    }
}

export const DataLocationMap = [
    { kind: FieldComponentConfigKind, def: DataLocationFieldComponentConfig },
    { kind: FieldComponentDefinitionKind, def: DataLocationFieldComponentDefinition, class: DataLocationComponentName },
    { kind: FieldModelConfigKind, def: DataLocationFieldModelConfig },
    { kind: FieldModelDefinitionKind, def: DataLocationFieldModelDefinition, class: DataLocationModelName },
    { kind: FormComponentDefinitionKind, def: DataLocationFormComponentDefinition, class: DataLocationComponentName },
];

export const DataLocationDefaults = {
    [FormComponentDefinitionKind]: {
        [DataLocationComponentName]: {
            [FieldComponentDefinitionKind]: DataLocationComponentName,
            [FieldModelDefinitionKind]: DataLocationModelName,
        }
    }
};
