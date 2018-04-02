import { EventEmitter } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import 'rxjs/add/operator/toPromise';
import 'rxjs/add/observable/of';
import { Http } from '@angular/http';
import { BaseService } from '../base-service';
import { CompleterService, CompleterData } from 'ng2-completer';
import { ConfigService } from '../config-service';
/**
 * Vocabulary Field
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
export declare class VocabField extends FieldBase<any> {
    vocabId: string;
    sourceData: any;
    completerService: CompleterService;
    protected dataService: CompleterData;
    initialValue: any;
    titleFieldName: string;
    titleFieldArr: string[];
    titleFieldDelim: any;
    searchFields: string;
    fieldNames: string[];
    sourceType: string;
    lookupService: any;
    placeHolder: string;
    disableEditAfterSelect: boolean;
    stringLabelToField: string;
    constructor(options: any, injector: any);
    createFormModel(valueElem?: any, createFormGroup?: boolean): any;
    postInit(value: any): void;
    setEmptyValue(): any;
    setLookupServices(completerService: any, lookupService: any): void;
    initLookupData(): void;
    getTitle(data: any): string;
    getValue(data: any): {};
    getFieldValuePair(fldName: any, data: any, valObj: any): void;
}
export declare class VocabFieldLookupService extends BaseService {
    protected configService: ConfigService;
    constructor(http: Http, configService: ConfigService);
    getLookupData(field: VocabField): any;
    getCollectionRootUrl(collectionId: string): string;
    getUserLookupUrl(searchSource?: string): string;
    findLookupData(field: VocabField, search: string): void;
    getMintRootUrl(source: string): string;
}
export declare class VocabFieldComponent extends SimpleComponent {
    protected searchStr: string;
    field: VocabField;
    isEmbedded: boolean;
    canRemove: boolean;
    removeBtnText: string;
    removeBtnClass: string;
    index: number;
    disableEditAfterSelect: boolean;
    onRemoveBtnClick: EventEmitter<any>;
    disableInput: boolean;
    constructor();
    getGroupClass(fldName?: string): string;
    onSelect(selected: any): void;
    onKeyup(value: any): void;
    onRemove(event: any): void;
}
