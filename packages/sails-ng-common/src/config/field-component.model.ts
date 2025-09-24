import {
    BaseFieldComponentConfig,
    BaseFieldComponentConfigFrame,
    BaseFieldComponentDefinition,
    BaseFieldComponentDefinitionFrame
} from "./base-field-component.model";

export interface FieldComponentConfigFrame extends BaseFieldComponentConfigFrame {
}

export abstract class FieldComponentConfig extends BaseFieldComponentConfig implements FieldComponentConfigFrame {
    protected constructor(data?: FieldComponentConfigFrame) {
        super(data);
    }
}


export interface FieldComponentDefinitionFrame extends BaseFieldComponentDefinitionFrame {
    config?: FieldComponentConfigFrame;
}

export abstract class FieldComponentDefinition extends BaseFieldComponentDefinition implements FieldComponentDefinitionFrame {
    config?: FieldComponentConfig

    protected constructor(data: FieldComponentDefinitionFrame) {
        super(data);
        // The config must be assigned in the subclasses.
        this.config = undefined;
    }
}