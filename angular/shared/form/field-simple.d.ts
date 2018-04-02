import { EventEmitter } from '@angular/core';
import { FieldBase } from './field-base';
/**
 * Text Field Model
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>

 */
export declare class TextField extends FieldBase<string> {
    type: string;
    constructor(options: any, injector: any);
    postInit(value: any): void;
}
export declare class TextArea extends FieldBase<string> {
    rows: number;
    cols: number;
    lines: string[];
    constructor(options: any, injector: any);
    formatValueForDisplay(): void;
}
export declare class SelectionField extends FieldBase<any> {
    options: {
        key: string;
        value: string;
    }[];
    constructor(options: any, injector: any);
    createFormModel(): any;
}
export declare class Container extends FieldBase<any> {
    content: string;
    fields: FieldBase<any>[];
    active: boolean;
    type: string;
    constructor(options: any, injector: any);
    getGroup(group: any, fieldMap: any): any;
    createFormModel(): any;
}
export declare class TabOrAccordionContainer extends Container {
    onTabChange: EventEmitter<any>;
    tabNavContainerClass: any;
    tabNavClass: any;
    tabContentContainerClass: any;
    tabContentClass: any;
    accContainerClass: any;
    accClass: any;
    constructor(options: any, injector: any);
}
export declare class ButtonBarContainer extends Container {
    constructor(options: any, injector: any);
}
export declare class DateTime extends FieldBase<any> {
    datePickerOpts: any;
    timePickerOpts: any;
    hasClearButton: boolean;
    valueFormat: string;
    displayFormat: string;
    constructor(options: any, injector: any);
    formatValue(value: any): any;
    parseToDate(value: any): Date;
    formatValueForDisplay(): string;
    reactEvent(eventName: string, eventData: any, origData: any): void;
}
export declare class SaveButton extends FieldBase<string> {
    label: string;
    redirectLocation: string;
    closeOnSave: boolean;
    buttonClass: string;
    constructor(options: any, injector: any);
}
export declare class CancelButton extends FieldBase<string> {
    label: string;
    constructor(options: any, injector: any);
}
export declare class AnchorOrButton extends FieldBase<string> {
    onClick_RootFn: any;
    type: string;
    isDisabledFn: any;
    showPencil: boolean;
    constructor(options: any, injector: any);
}
export declare class HiddenValue extends FieldBase<string> {
    constructor(options: any, injector: any);
}
export declare class LinkValue extends FieldBase<string> {
    target: string;
    constructor(options: any, injector: any);
}
