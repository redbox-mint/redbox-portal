import {FormConfigVisitorOutline} from "./visitor/base.outline";
import {FieldDefinitionOutline} from "./field.outline";


/**
 * The base form field definition.
 *
 * This is the basic structure used by component, model, and layout definitions.
 */
export abstract class FieldDefinition implements FieldDefinitionOutline {
    abstract class: string;
    abstract config?: object;

    abstract accept(visitor: FormConfigVisitorOutline): void;
}