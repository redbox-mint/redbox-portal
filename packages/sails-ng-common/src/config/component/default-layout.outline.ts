import {FieldLayoutConfigFrame, FieldLayoutDefinitionFrame} from "../field-layout.outline";

export const DefaultLayoutName = `DefaultLayout` as const;
export type DefaultLayoutNameType = typeof DefaultLayoutName;

export interface DefaultFieldLayoutConfigFrame extends FieldLayoutConfigFrame {
}

export interface DefaultFieldLayoutConfigOutline extends DefaultFieldLayoutConfigFrame {

}

export interface DefaultFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: DefaultLayoutNameType;
    config?: DefaultFieldLayoutConfigFrame;
}

export interface DefaultFieldLayoutDefinitionOutline extends DefaultFieldLayoutDefinitionFrame {
    class: DefaultLayoutNameType;
    config?: DefaultFieldLayoutConfigOutline;
}

export type DefaultLayoutFrames = DefaultFieldLayoutConfigFrame
    | DefaultFieldLayoutDefinitionFrame
    ;

export type DefaultLayoutOutlines = DefaultFieldLayoutConfigOutline
    | DefaultFieldLayoutDefinitionOutline
    ;