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
    PDFListComponentName,
    PDFListFieldComponentConfigOutline,
    PDFListFieldComponentDefinitionOutline,
    PDFListFieldModelConfigOutline,
    PDFListFieldModelDefinitionOutline,
    PDFListFormComponentDefinitionOutline,
    PDFListModelName,
    PDFListModelValueType,
    RecordAttachment
} from "./pdf-list.outline";

export class PDFListFieldComponentConfig extends FieldComponentConfig implements PDFListFieldComponentConfigOutline {
    startsWith = "rdmp-pdf";
    showVersionColumn = false;
    versionColumnValueField = "";
    versionColumnLabelKey = "";
    useVersionLabelForFileName = false;
    downloadBtnLabel = "Download a PDF of this plan";
    downloadPreviousBtnLabel = "Download a previous version";
    downloadPrefix = "rdmp";
    fileNameTemplate = "";
}

export class PDFListFieldComponentDefinition extends FieldComponentDefinition implements PDFListFieldComponentDefinitionOutline {
    class = PDFListComponentName;
    config?: PDFListFieldComponentConfigOutline;

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitPDFListFieldComponentDefinition(this);
    }
}

export class PDFListFieldModelConfig extends FieldModelConfig<PDFListModelValueType> implements PDFListFieldModelConfigOutline {
    defaultValue: RecordAttachment[];

    constructor() {
        super();
        this.defaultValue = [];
    }
}

export class PDFListFieldModelDefinition extends FieldModelDefinition<PDFListModelValueType> implements PDFListFieldModelDefinitionOutline {
    class = PDFListModelName;
    config?: PDFListFieldModelConfigOutline;

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitPDFListFieldModelDefinition(this);
    }
}

export class PDFListFormComponentDefinition extends FormComponentDefinition implements PDFListFormComponentDefinitionOutline {
    public component!: PDFListFieldComponentDefinitionOutline;
    public model?: PDFListFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitPDFListFormComponentDefinition(this);
    }
}

export const PDFListMap = [
    { kind: FieldComponentConfigKind, def: PDFListFieldComponentConfig },
    { kind: FieldComponentDefinitionKind, def: PDFListFieldComponentDefinition, class: PDFListComponentName },
    { kind: FieldModelConfigKind, def: PDFListFieldModelConfig },
    { kind: FieldModelDefinitionKind, def: PDFListFieldModelDefinition, class: PDFListModelName },
    { kind: FormComponentDefinitionKind, def: PDFListFormComponentDefinition, class: PDFListComponentName },
];

export const PDFListDefaults = {
    [FormComponentDefinitionKind]: {
        [PDFListComponentName]: {
            [FieldComponentDefinitionKind]: PDFListComponentName,
            [FieldModelDefinitionKind]: PDFListModelName,
        }
    }
};
