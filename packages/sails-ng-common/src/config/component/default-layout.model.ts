import {
    FormFieldLayoutConfig, FormFieldLayoutConfigFrame,
    FormFieldLayoutDefinition,
    FormFieldLayoutDefinitionFrame,
    FormFieldLayoutConfigKind, FormFieldLayoutDefinitionKind
} from "..";
import {FormConfigItemVisitor} from "../visitor";


/* Default Layout */
export interface DefaultFormFieldLayoutConfigFrame extends FormFieldLayoutConfigFrame {
}

export class DefaultFormFieldLayoutConfig extends FormFieldLayoutConfig implements DefaultFormFieldLayoutConfigFrame {

    constructor(data?: FormFieldLayoutConfigFrame) {
        super(data);
    }
}

export interface DefaultFormFieldLayoutDefinitionFrame extends FormFieldLayoutDefinitionFrame {
}

export const DefaultLayoutName = `DefaultLayoutComponent` as const;
export class DefaultFormFieldLayoutDefinition extends FormFieldLayoutDefinition implements DefaultFormFieldLayoutDefinitionFrame {
    class = DefaultLayoutName;
    config?: DefaultFormFieldLayoutConfig;

    constructor(data?: DefaultFormFieldLayoutDefinitionFrame) {
        super(data ?? {class:DefaultLayoutName});
        this.config = new DefaultFormFieldLayoutConfig(data?.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitDefaultFormFieldLayoutDefinition(this);
    }
}

export const DefaultLayoutMap = [
    {class: DefaultLayoutName, kind: FormFieldLayoutConfigKind, def: DefaultFormFieldLayoutConfig},
    {class: DefaultLayoutName, kind: FormFieldLayoutDefinitionKind, def: DefaultFormFieldLayoutDefinition},
];
export type DefaultLayoutFrames = DefaultFormFieldLayoutConfigFrame | DefaultFormFieldLayoutDefinitionFrame;