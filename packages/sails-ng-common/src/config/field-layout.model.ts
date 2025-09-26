import {
    BaseFieldComponentConfig,
     BaseFieldComponentDefinition,
} from "./base-field-component.model";
import {
    FieldLayoutConfigOutline,
    FieldLayoutDefinitionOutline
} from "./field-layout.outline";



/**
 * The common form field layout config properties.
 */
export abstract class FieldLayoutConfig extends BaseFieldComponentConfig implements FieldLayoutConfigOutline {
    public labelRequiredStr?: string = '*';
    public helpText?: string;
    public cssClassesMap?: Record<string, string> = {};
    public helpTextVisibleOnInit?: boolean = false;
    public helpTextVisible?: boolean = false;
}



/**
 * The common form field layout definition properties.
 */
export abstract class FieldLayoutDefinition extends BaseFieldComponentDefinition implements FieldLayoutDefinitionOutline {
    abstract config?: FieldLayoutConfig;
    /**
     * Optional name for the layout, used to reference the layout on the client-side.
     */
    name?: string;
}
