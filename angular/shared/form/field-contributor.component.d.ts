import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { VocabField } from './field-vocab.component';
/**
 * Contributor Model
 *
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
export declare class ContributorField extends FieldBase<any> {
    nameColHdr: string;
    emailColHdr: string;
    roleColHdr: string;
    showHeader: boolean;
    roles: string[];
    fieldNames: any;
    fullNameResponseField: string;
    groupFieldNames: string[];
    validators: any;
    enabledValidators: boolean;
    marginTop: string;
    role: string;
    vocabField: VocabField;
    previousEmail: string;
    username: string;
    hasInit: boolean;
    freeText: boolean;
    forceLookupOnly: boolean;
    constructor(options: any, injector: any);
    setLookupServices(completerService: any, lookupService: any): void;
    createFormModel(valueElem?: any): any;
    setValue(value: any, emitEvent?: boolean): void;
    toggleValidator(c: any): (value: any) => void;
    enableValidators(): void;
    disableValidators(): void;
    postInit(value: any): void;
    setEmptyValue(): any;
    readonly isValid: boolean;
    triggerValidation(): void;
    getValidationError(): any;
    reactEvent(eventName: string, eventData: any, origData: any): void;
}
export declare class ContributorComponent extends SimpleComponent {
    field: ContributorField;
    isEmbedded: boolean;
    getGroupClass(fldName: any): string;
    onSelect(selected: any): void;
}
