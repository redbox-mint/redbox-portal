import { EventEmitter, Injector } from '@angular/core';
import { TranslationService } from '../translation-service';
import { UtilityService } from '../util-service';
/**
 * Base class for dynamic form models...
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
export declare class FieldBase<T> {
    value: T;
    id: string;
    name: string;
    label: string;
    required: boolean;
    controlType: string;
    compClass: any;
    form: any;
    groupClasses: any;
    cssClasses: any;
    isGroup: boolean;
    hasGroup: boolean;
    hasLookup: boolean;
    options: any;
    groupName: string;
    hasControl: boolean;
    formModel: any;
    validationMessages: any;
    editMode: boolean;
    readOnly: boolean;
    help: string;
    translationService: TranslationService;
    defaultValue: any;
    marginTop: string;
    onChange: any;
    publish: any;
    subscribe: any;
    fieldMap: any;
    utilityService: UtilityService;
    injector: Injector;
    onValueUpdate: EventEmitter<any>;
    constructor(options: {}, injector: any);
    getFromInjector(token: any): any;
    setOptions(options?: {
        value?: T;
        name?: string;
        id?: string;
        label?: string;
        required?: boolean;
        order?: number;
        controlType?: string;
        cssClasses?: any;
        groupName?: string;
        editMode?: boolean;
        readOnly?: boolean;
        help?: string;
        defaultValue?: any;
    }): void;
    getTranslated(key: any, defValue: any): any;
    readonly isValid: any;
    createFormModel(): any;
    /**
     * Creates a control group and populates field map with:
     *
     * fieldMap[name].control = the NG2 FormControl
     * fieldMap[name].field = the Field model (this)
     *
     * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
     * @param  {any} group
     * @param  {any} fieldMap
     * @return {any}
     */
    getGroup(group: any, fieldMap: any): any;
    triggerValidation(): void;
    valueNotNull(data: any): boolean;
    setupEventHandlers(): void;
    emitEvent(eventName: string, eventData: any, origData: any): void;
    reactEvent(eventName: string, eventData: any, origData: any): void;
    setFieldMapEntry(fieldMap: any, fieldCompRef: any): void;
    getFullFieldName(name?: any): string;
    getControl(name?: any, fieldMap?: any): any;
}
