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
    FileUploadAttachmentValue,
    FileUploadComponentName,
    FileUploadFieldComponentConfigOutline,
    FileUploadFieldComponentDefinitionOutline,
    FileUploadFieldModelConfigOutline,
    FileUploadFieldModelDefinitionOutline,
    FileUploadFormComponentDefinitionOutline,
    FileUploadModelName,
    FileUploadModelValueType,
    FileUploadSourceType
} from "./file-upload.outline";

const DefaultFileUploadValue: FileUploadModelValueType = [];

/* File Upload Component */

export class FileUploadFieldComponentConfig extends FieldComponentConfig implements FileUploadFieldComponentConfigOutline {
    restrictions?: Record<string, unknown>;
    enabledSources: FileUploadSourceType[] = [];
    companionUrl?: string;
    allowUploadWithoutSave = false;
    uppyDashboardNote = "Maximum upload size: 1 Gb per file";
    tusHeaders?: Record<string, string>;

    constructor() {
        super();
    }
}

export class FileUploadFieldComponentDefinition extends FieldComponentDefinition implements FileUploadFieldComponentDefinitionOutline {
    class = FileUploadComponentName;
    config?: FileUploadFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitFileUploadFieldComponentDefinition(this);
    }
}

/* File Upload Model */

export class FileUploadFieldModelConfig extends FieldModelConfig<FileUploadModelValueType> implements FileUploadFieldModelConfigOutline {
    defaultValue: FileUploadAttachmentValue[] = DefaultFileUploadValue;

    constructor() {
        super();
    }
}

export class FileUploadFieldModelDefinition extends FieldModelDefinition<FileUploadModelValueType> implements FileUploadFieldModelDefinitionOutline {
    class = FileUploadModelName;
    config?: FileUploadFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitFileUploadFieldModelDefinition(this);
    }
}

/* File Upload Form Component */

export class FileUploadFormComponentDefinition extends FormComponentDefinition implements FileUploadFormComponentDefinitionOutline {
    public component!: FileUploadFieldComponentDefinitionOutline;
    public model?: FileUploadFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitFileUploadFormComponentDefinition(this);
    }
}

export const FileUploadMap = [
    { kind: FieldComponentConfigKind, def: FileUploadFieldComponentConfig },
    { kind: FieldComponentDefinitionKind, def: FileUploadFieldComponentDefinition, class: FileUploadComponentName },
    { kind: FieldModelConfigKind, def: FileUploadFieldModelConfig },
    { kind: FieldModelDefinitionKind, def: FileUploadFieldModelDefinition, class: FileUploadModelName },
    { kind: FormComponentDefinitionKind, def: FileUploadFormComponentDefinition, class: FileUploadComponentName },
];

export const FileUploadDefaults = {
    [FormComponentDefinitionKind]: {
        [FileUploadComponentName]: {
            [FieldComponentDefinitionKind]: FileUploadComponentName,
            [FieldModelDefinitionKind]: FileUploadModelName,
        }
    }
};
