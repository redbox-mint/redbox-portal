import {
    FieldLayoutConfig,
    FieldLayoutConfigFrame,
    FieldLayoutDefinition,
    FieldLayoutDefinitionFrame
} from "../field-layout.model";
import {FieldLayoutConfigKind, FieldLayoutDefinitionKind} from "../shared.model";
import {IFormConfigVisitor} from "../visitor/base.structure";



/* Default Layout */
export const DefaultLayoutName = `DefaultLayout` as const;
export type DefaultLayoutNameType = typeof DefaultLayoutName;

export interface DefaultFieldLayoutConfigFrame extends FieldLayoutConfigFrame {
}

export class DefaultFieldLayoutConfig extends FieldLayoutConfig implements DefaultFieldLayoutConfigFrame {
    constructor() {
        super();
    }
}

export interface DefaultFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: DefaultLayoutNameType;
    config?: DefaultFieldLayoutConfigFrame;
}


export class DefaultFieldLayoutDefinition extends FieldLayoutDefinition implements DefaultFieldLayoutDefinitionFrame {
    class = DefaultLayoutName;
    config?: DefaultFieldLayoutConfig;
    constructor() {
        super();
    }
    accept(visitor: IFormConfigVisitor): void {
        visitor.visitDefaultFieldLayoutDefinition(this);
    }
}

export const DefaultLayoutMap = [
    {kind: FieldLayoutConfigKind, def: DefaultFieldLayoutConfig},
    {kind: FieldLayoutDefinitionKind, def: DefaultFieldLayoutDefinition, class: DefaultLayoutName},
];
export type DefaultLayoutFrames =
    DefaultFieldLayoutConfigFrame
    | DefaultFieldLayoutDefinitionFrame;