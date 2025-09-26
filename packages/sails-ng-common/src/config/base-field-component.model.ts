import {FieldDefinition} from "./field.model";
import {KeyValueStringProperty} from "./shared.outline";
import {BaseFieldComponentConfigOutline, BaseFieldComponentDefinitionOutline} from "./base-field-component.outline";


/**
 * The common form field component config properties.
 */
export abstract class BaseFieldComponentConfig implements BaseFieldComponentConfigOutline {
    public readonly?: boolean = false;
    public visible?: boolean = true;
    public editMode?: boolean = true;
    public label?: string;
    public defaultComponentCssClasses?: KeyValueStringProperty;
    public hostCssClasses?: KeyValueStringProperty;
    public wrapperCssClasses?: KeyValueStringProperty;
    public disabled?: boolean = false;
    public autofocus?: boolean = false;
    public tooltip?: string;
}


/**
 * The common form field component definition properties.
 */
export abstract class BaseFieldComponentDefinition extends FieldDefinition implements BaseFieldComponentDefinitionOutline {
    abstract config?: BaseFieldComponentConfig;
}