import {
    BaseFieldComponentConfig,
    BaseFieldComponentDefinition,
} from "./base-field-component.model";
import {FieldComponentConfigOutline, FieldComponentDefinitionOutline} from "./field-component.outline";


export abstract class FieldComponentConfig extends BaseFieldComponentConfig implements FieldComponentConfigOutline {
}


export abstract class FieldComponentDefinition extends BaseFieldComponentDefinition implements FieldComponentDefinitionOutline {
    abstract config?: FieldComponentConfig;
}