import {
    FormFieldLayoutConfig, FormFieldLayoutConfigFrame,
    FormFieldLayoutDefinition,
    FormFieldLayoutDefinitionFrame
} from "../form-field-layout.model";
import {FormConfigItemVisitor} from "../visitor";
import {FormFieldLayoutConfigKind, FormFieldLayoutDefinitionKind} from "../shared.model";



/* Default Layout */
export const DefaultLayoutName = `DefaultLayoutComponent` as const;
export type DefaultLayoutLayoutType = typeof DefaultLayoutName;

export interface DefaultFormFieldLayoutConfigFrame extends FormFieldLayoutConfigFrame {
}

export class DefaultFormFieldLayoutConfig extends FormFieldLayoutConfig implements DefaultFormFieldLayoutConfigFrame {

    constructor(data: FormFieldLayoutConfigFrame) {
        super(data);
    }
}

export interface DefaultFormFieldLayoutDefinitionFrame extends FormFieldLayoutDefinitionFrame {
}

export class DefaultFormFieldLayoutDefinition extends FormFieldLayoutDefinition implements DefaultFormFieldLayoutDefinitionFrame {
    class: DefaultLayoutLayoutType = DefaultLayoutName;
    config?: DefaultFormFieldLayoutConfig;

    constructor(data: DefaultFormFieldLayoutDefinitionFrame) {
        super(data);
        this.config = new DefaultFormFieldLayoutConfig(data.config ?? {});
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