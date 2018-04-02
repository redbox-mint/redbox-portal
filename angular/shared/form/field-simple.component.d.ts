import { OnInit, Injector } from '@angular/core';
import { FieldBase } from './field-base';
import { DateTime, AnchorOrButton, SaveButton, CancelButton, TextArea, TextField, TabOrAccordionContainer } from './field-simple';
import { FormGroup, FormControl } from '@angular/forms';
/**
 * A component base class
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */
export declare class SimpleComponent {
    /**
     * Field model
     */
    field: FieldBase<any>;
    /**
     * The form group
     */
    form: FormGroup;
    /**
     * The field mapping
     */
    fieldMap: any;
    /**
     * The index of this field
     */
    index: any;
    /**
     * The name of this field
     */
    name: any;
    isEmbedded: boolean;
    /**
     * The NG2 root injector
     */
    injector: Injector;
    /**
     * Toggles help display
     */
    helpShow: boolean;
    /**
     * Optional parentId of this component
     */
    parentId: string;
    /**
     * Return the NG2 FormControl or subclass thereof
     * @param  {string = null} name
     * @return {FormControl}
     */
    getFormControl(name?: string, ctrlIndex?: number): FormControl;
    /**
     * Returns the CSS class
     * @param  {string=null} fldName
     * @return {string}
     */
    getGroupClass(fldName?: string): string;
    /**
     * If this field has a 'required' error.
     * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
     * @return {[type]}
     */
    hasRequiredError(): boolean;
    /**
     * Convenience method to toggle help mode.
     * @return {[type]}
     */
    toggleHelp(): void;
    /**
     * Returns label
     * @return {string}
     */
    getRequiredLabelStr(): string;
    /**
     * Returns the NG2 root injector
     * @param  {any} token
     * @return {any}
     */
    getFromInjector(token: any): any;
}
/**
 * Component
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */
export declare class TextAreaComponent extends SimpleComponent implements OnInit {
    field: TextArea;
    ngOnInit(): void;
}
export declare class SelectionComponent extends SimpleComponent {
    getLabel(val: any): string;
}
export declare class DropdownFieldComponent extends SelectionComponent {
}
export declare class SelectionFieldComponent extends SelectionComponent {
    isRadio(): boolean;
    getControlFromOption(opt: any): any;
    onChange(opt: any, event: any): void;
}
/****************************************************************************
Container components
*****************************************************************************/
export declare class TabOrAccordionContainerComponent extends SimpleComponent {
    field: TabOrAccordionContainer;
    ngAfterViewInit(): void;
}
export declare class ButtonBarContainerComponent extends SimpleComponent {
}
export declare class HtmlRawComponent extends SimpleComponent {
}
export declare class TextBlockComponent extends SimpleComponent {
    field: TextField;
}
/**
Wrapped: https://github.com/nkalinov/ng2-datetime
Based on: https://bootstrap-datepicker.readthedocs.io/en/stable/
*/
export declare class DateTimeComponent extends SimpleComponent {
    /**
     * The field model
     */
    field: DateTime;
    /**
     * Component method that formats the value, delegates to field.
     */
    formatValue(): any;
}
/**
* #### Save Button Component.
*
* Calls the form framework's save function to create or update the record.
*
* #### Usage
* ```
*     {
*          class: "SaveButton",
*          definition: {
*            label: 'Save & Close',
*            closeOnSave: true,
*            redirectLocation: '/@branding/@portal/dashboard'
*          }
*        }
* ```
*
*| Property Name    | Description                                                    | Required | Default |
*|------------------|----------------------------------------------------------------|----------|---------|
*| label            | The text to display on the button                              | Yes      |         |
*| closeOnSave      | Flag to leave the page on successful save                      | No       | false   |
*| redirectLocation | The location to redirect to if closeOnSave flag is set to true | No       |         |
*/
export declare class SaveButtonComponent extends SimpleComponent {
    field: SaveButton;
    onClick(event: any): void;
}
/**
* # Cancel Button Component
*
* #### Button designed to
*  @param  {CancelButton} cancelButton
*   @return {FormControl}
*/
export declare class CancelButtonComponent extends SimpleComponent {
    field: CancelButton;
}
export declare class AnchorOrButtonComponent extends SimpleComponent {
    field: AnchorOrButton;
    onClick(event: any): void;
    isDisabled(): any;
}
export declare class LinkValueComponent extends SimpleComponent {
    isVisible(): boolean;
}
export declare class HiddenValueComponent extends SimpleComponent {
    handleChange(value: any, source: string): void;
}
