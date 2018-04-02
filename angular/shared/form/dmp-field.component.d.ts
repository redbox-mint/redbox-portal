import { ViewContainerRef, ComponentFactoryResolver, ApplicationRef } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FieldBase } from './field-base';
/**
 * Base component for a DMP field.
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
export declare class DmpFieldComponent {
    private componentFactoryResolver;
    protected app: ApplicationRef;
    /**
     * The model for this field.
     */
    field: FieldBase<any>;
    /**
     * Form group
     */
    form: FormGroup;
    /**
     * The value of this field.
     */
    value: any;
    /**
     * Field map
     */
    fieldMap: any;
    /**
     * The DOM node for this field.
     */
    fieldAnchor: ViewContainerRef;
    /**
     * The parentId of this field
     */
    parentId: string;
    isEmbedded: boolean;
    name: any;
    index: number;
    disabledExpression: string;
    fieldElement: any;
    /**
    * Elements that were already disabled before we ran isDisabled (so they can be restored disabled)
    */
    private disabledElements;
    /**
     * For DI'ing...
     */
    constructor(componentFactoryResolver: ComponentFactoryResolver, app: ApplicationRef);
    /**
     * If the form is valid.
     */
    readonly isValid: boolean;
    /**
     *
     */
    isDisabled(): string;
    /**
     * Change handler, instantiates the field component.
     */
    ngOnChanges(): void;
}
