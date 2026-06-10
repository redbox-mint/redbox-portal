import {
    FieldComponentConfigFrameKindType, FieldComponentConfigKindType,
    FieldComponentDefinitionFrameKindType, FieldComponentDefinitionKindType,
    FieldModelConfigFrameKindType,
    FieldModelConfigKindType, FieldModelDefinitionFrameKindType,
    FieldModelDefinitionKindType, FormComponentDefinitionFrameKindType, FormComponentDefinitionKindType
} from "../shared.outline";
import {
    FieldComponentConfigFrame,
    FieldComponentConfigOutline,
    FieldComponentDefinitionFrame, FieldComponentDefinitionOutline
} from "../field-component.outline";
import {
    FieldModelConfigFrame,
    FieldModelConfigOutline,
    FieldModelDefinitionFrame,
    FieldModelDefinitionOutline
} from "../field-model.outline";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {
    AvailableFieldLayoutDefinitionFrames,
    AvailableFieldLayoutDefinitionOutlines,
    AvailableFormComponentDefinitionFrames,
    AvailableFormComponentDefinitionOutlines
} from "../dictionary.outline";

/* EditTable Component */
export const EditTableComponentName = "EditTableComponent" as const;
export type EditTableComponentNameType = typeof EditTableComponentName;

/**
 * Configuration for one column in the edit table.
 */
export interface EditTableColumnConfig {
    /**
     * The column header label. Can be a translation message id (e.g. '@my-form-contributor-name').
     */
    label: string;
    /**
     * Dot-path into the row object used to obtain the cell value (e.g. 'contact.email').
     */
    path: string;
    /**
     * Optional handlebars template used to format the cell display value.
     * Template context: { value, row, index }.
     */
    format?: string;
    /**
     * Optional css classes applied to the column header and cells.
     */
    cssClasses?: string;
}

export interface EditTableFieldComponentConfigFrame extends FieldComponentConfigFrame {
    /**
     * The sub-form rendered inside the add/edit dialog. Same DSL as Group's children.
     */
    componentDefinitions: AvailableFormComponentDefinitionFrames[];
    /**
     * The columns displayed in the table.
     */
    columns: EditTableColumnConfig[];
    addButtonLabel?: string;
    editButtonLabel?: string;
    deleteButtonLabel?: string;
    dialogAddTitle?: string;
    dialogEditTitle?: string;
    dialogSaveLabel?: string;
    dialogCancelLabel?: string;
    /**
     * When true, deleting a row requires confirmation.
     */
    confirmDelete?: boolean;
    /**
     * Message displayed when the table has no rows.
     */
    emptyMessage?: string;
    /**
     * Optional maximum number of rows. The add button is hidden when reached.
     */
    maxRows?: number;
}

export interface EditTableFieldComponentConfigOutline extends EditTableFieldComponentConfigFrame, FieldComponentConfigOutline {
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];
}

export interface EditTableFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
    class: EditTableComponentNameType;
    config?: EditTableFieldComponentConfigFrame;
}

export interface EditTableFieldComponentDefinitionOutline extends EditTableFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
    class: EditTableComponentNameType;
    config?: EditTableFieldComponentConfigOutline;
}

/* EditTable Model */
export const EditTableModelName = "EditTableModel" as const;
export type EditTableModelNameType = typeof EditTableModelName;
export type EditTableModelValueType = Record<string, unknown>[];

export interface EditTableFieldModelConfigFrame extends FieldModelConfigFrame<EditTableModelValueType> {
}

export interface EditTableFieldModelConfigOutline extends EditTableFieldModelConfigFrame, FieldModelConfigOutline<EditTableModelValueType> {
}

export interface EditTableFieldModelDefinitionFrame extends FieldModelDefinitionFrame<EditTableModelValueType> {
    class: EditTableModelNameType;
    config?: EditTableFieldModelConfigFrame;
}

export interface EditTableFieldModelDefinitionOutline extends EditTableFieldModelDefinitionFrame, FieldModelDefinitionOutline<EditTableModelValueType> {
    class: EditTableModelNameType;
    config?: EditTableFieldModelConfigOutline;
}

/* EditTable Form Component */
export interface EditTableFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
    component: EditTableFieldComponentDefinitionFrame;
    model?: EditTableFieldModelDefinitionFrame;
    layout?: AvailableFieldLayoutDefinitionFrames;
}

export interface EditTableFormComponentDefinitionOutline extends EditTableFormComponentDefinitionFrame, FormComponentDefinitionOutline {
    component: EditTableFieldComponentDefinitionOutline;
    model?: EditTableFieldModelDefinitionOutline;
    layout?: AvailableFieldLayoutDefinitionOutlines;
}

export type EditTableTypes =
    | { kind: FieldComponentConfigFrameKindType, class: EditTableFieldComponentConfigFrame }
    | { kind: FieldComponentDefinitionFrameKindType, class: EditTableFieldComponentDefinitionFrame }
    | { kind: FieldModelConfigFrameKindType, class: EditTableFieldModelConfigFrame }
    | { kind: FieldModelDefinitionFrameKindType, class: EditTableFieldModelDefinitionFrame }
    | { kind: FormComponentDefinitionFrameKindType, class: EditTableFormComponentDefinitionFrame }
    | { kind: FieldComponentConfigKindType, class: EditTableFieldComponentConfigOutline }
    | { kind: FieldComponentDefinitionKindType, class: EditTableFieldComponentDefinitionOutline }
    | { kind: FieldModelConfigKindType, class: EditTableFieldModelConfigOutline }
    | { kind: FieldModelDefinitionKindType, class: EditTableFieldModelDefinitionOutline }
    | { kind: FormComponentDefinitionKindType, class: EditTableFormComponentDefinitionOutline }
    ;
