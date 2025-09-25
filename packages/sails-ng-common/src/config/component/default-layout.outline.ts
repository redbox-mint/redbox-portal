import {
    FieldLayoutConfigFrame,
    FieldLayoutConfigOutline,
    FieldLayoutDefinitionFrame,
    FieldLayoutDefinitionOutline
} from "../field-layout.outline";
import {
    FieldLayoutConfigFrameKindType, FieldLayoutConfigKindType,
    FieldLayoutDefinitionFrameKindType,
    FieldLayoutDefinitionKindType
} from "../shared.outline";

export const DefaultLayoutName = `DefaultLayout` as const;
export type DefaultLayoutNameType = typeof DefaultLayoutName;

export interface DefaultFieldLayoutConfigFrame extends FieldLayoutConfigFrame {
}

export interface DefaultFieldLayoutConfigOutline extends DefaultFieldLayoutConfigFrame, FieldLayoutConfigOutline {

}

export interface DefaultFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: DefaultLayoutNameType;
    config?: DefaultFieldLayoutConfigFrame;
}

export interface DefaultFieldLayoutDefinitionOutline extends DefaultFieldLayoutDefinitionFrame, FieldLayoutDefinitionOutline {
    class: DefaultLayoutNameType;
    config?: DefaultFieldLayoutConfigOutline;
}

export type DefaultLayoutTypes = { kind: FieldLayoutConfigFrameKindType, class: DefaultFieldLayoutConfigFrame }
    | { kind: FieldLayoutConfigKindType, class: DefaultFieldLayoutConfigOutline }
    | { kind: FieldLayoutDefinitionFrameKindType, class: DefaultFieldLayoutDefinitionFrame }
    | { kind: FieldLayoutDefinitionKindType, class: DefaultFieldLayoutDefinitionOutline }
    ;