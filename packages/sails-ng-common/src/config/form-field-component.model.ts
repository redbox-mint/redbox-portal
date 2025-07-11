import {KeyValueStringProperty} from "./shared.model";

/**
 *
 */
export interface BaseFormFieldComponentDefinition {
}

/**
 *
 */
export class BaseFormFieldComponentConfig {
    // the view read-only state
    public readonly?: boolean = false;
    // the visibility state
    public visible?: boolean = true;
    // the editMode
    public editMode?: boolean = true;
    // the component/control type
    public type?: string = '';
    // the label
    public label?: string = '';
    // the form-supplied css classes
    public defaultComponentCssClasses?: KeyValueStringProperty = null;
    // the css classes to bind to host
    public hostCssClasses?: KeyValueStringProperty = null;
    // the wrapper css classes to bind to host
    public wrapperCssClasses?: KeyValueStringProperty = null;
    //
    public disabled?: boolean = false;
    //
    public autofocus?: boolean = false;
    //
    public tooltip?: string = '';
}
