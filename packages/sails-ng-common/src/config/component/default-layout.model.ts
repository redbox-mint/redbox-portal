import {FieldLayoutConfig, FieldLayoutDefinition} from "../field-layout.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    DefaultFieldLayoutConfigOutline,
    DefaultFieldLayoutDefinitionOutline,
    DefaultLayoutName
} from "./default-layout.outline";
import {FieldLayoutConfigKind, FieldLayoutDefinitionKind} from "../shared.outline";


/* Default Layout */


export class DefaultFieldLayoutConfig extends FieldLayoutConfig implements DefaultFieldLayoutConfigOutline {
    constructor() {
        super();
    }
}


export class DefaultFieldLayoutDefinition extends FieldLayoutDefinition implements DefaultFieldLayoutDefinitionOutline {
    class = DefaultLayoutName;
    config?: DefaultFieldLayoutConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline): void {
        visitor.visitDefaultFieldLayoutDefinition(this);
    }
}

export const DefaultLayoutMap = [
    {kind: FieldLayoutConfigKind, def: DefaultFieldLayoutConfig},
    {kind: FieldLayoutDefinitionKind, def: DefaultFieldLayoutDefinition, class: DefaultLayoutName},
];
