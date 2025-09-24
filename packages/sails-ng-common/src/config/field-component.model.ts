import {
    BaseFieldComponentConfig,
    BaseFieldComponentConfigFrame,
    BaseFieldComponentDefinition,
    BaseFieldComponentDefinitionFrame
} from "./base-field-component.model";

export interface FieldComponentConfigFrame extends BaseFieldComponentConfigFrame {
}

export abstract class FieldComponentConfig extends BaseFieldComponentConfig implements FieldComponentConfigFrame {

}


export interface FieldComponentDefinitionFrame extends BaseFieldComponentDefinitionFrame {
    config?: FieldComponentConfigFrame;
}

export abstract class FieldComponentDefinition extends BaseFieldComponentDefinition implements FieldComponentDefinitionFrame {
    abstract config?: FieldComponentConfig;
}