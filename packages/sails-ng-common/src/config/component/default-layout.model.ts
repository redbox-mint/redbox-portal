import {
    FieldLayoutConfig, FieldLayoutConfigFrame,
    FieldLayoutDefinition,
    FieldLayoutDefinitionFrame,
    FieldLayoutConfigKind, FieldLayoutDefinitionKind,
    FormConfigItemVisitor
} from "../..";


/* Default Layout */
export const DefaultLayoutName = `DefaultLayout` as const;
export type DefaultLayoutNameType = typeof DefaultLayoutName;

export interface DefaultFieldLayoutConfigFrame extends FieldLayoutConfigFrame {
}

export class DefaultFieldLayoutConfig extends FieldLayoutConfig implements DefaultFieldLayoutConfigFrame {
    constructor(data?: FieldLayoutConfigFrame) {
        super(data);
    }
}

export interface DefaultFieldLayoutDefinitionFrame extends FieldLayoutDefinitionFrame {
    class: DefaultLayoutNameType;
    config?: DefaultFieldLayoutConfigFrame;
}

export class DefaultFieldLayoutDefinition extends FieldLayoutDefinition implements DefaultFieldLayoutDefinitionFrame {
    class = DefaultLayoutName;
    config?: DefaultFieldLayoutConfig;

    constructor(data?: DefaultFieldLayoutDefinitionFrame) {
        super(data ?? {class: DefaultLayoutName});
        this.config = new DefaultFieldLayoutConfig(data?.config);
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitDefaultFieldLayoutDefinition(this);
    }
}

export const DefaultLayoutMap = [
    {kind: FieldLayoutConfigKind, def: DefaultFieldLayoutConfig},
    {kind: FieldLayoutDefinitionKind, def: DefaultFieldLayoutDefinition, class: DefaultLayoutName},
];
export type DefaultLayoutFrames = DefaultFieldLayoutConfigFrame | DefaultFieldLayoutDefinitionFrame;