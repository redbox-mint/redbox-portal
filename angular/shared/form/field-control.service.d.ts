import { ApplicationRef } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FieldBase } from './field-base';
import { TextField, Container, TextArea, DateTime, AnchorOrButton, SaveButton, CancelButton, HiddenValue, LinkValue, TabOrAccordionContainer, ButtonBarContainer, SelectionField } from './field-simple';
import { TextFieldComponent } from './field-textfield.component';
import { DropdownFieldComponent, TabOrAccordionContainerComponent, ButtonBarContainerComponent, TextBlockComponent, TextAreaComponent, DateTimeComponent, AnchorOrButtonComponent, SaveButtonComponent, CancelButtonComponent, HiddenValueComponent, LinkValueComponent } from './field-simple.component';
import { VocabField, VocabFieldComponent, VocabFieldLookupService } from './field-vocab.component';
import { RepeatableContainer, RepeatableVocabComponent } from './field-repeatable.component';
import { ContributorField, ContributorComponent } from './field-contributor.component';
import { WorkflowStepButton, WorkflowStepButtonComponent } from './workflow-button.component';
import { RelatedObjectDataField, RelatedObjectDataComponent } from './field-relatedobjectdata.component';
import { MapField, MapComponent } from './field-map.component';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/last';
import 'rxjs/add/observable/from';
import { CompleterService } from 'ng2-completer';
import { ConfigService } from '../config-service';
import { TranslationService } from '../translation-service';
import { UtilityService } from '../util-service';
import { GenericGroupComponent } from './field-group.component';
/**
 * Field / Model Factory Service...
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
export declare class FieldControlService {
    private vocabFieldLookupService;
    private completerService;
    protected configService: ConfigService;
    protected translationService: TranslationService;
    protected utilityService: UtilityService;
    protected app: ApplicationRef;
    protected classes: {
        'TextField': {
            'meta': typeof TextField;
            'comp': typeof TextFieldComponent;
        };
        'TextArea': {
            'meta': typeof TextArea;
            'comp': typeof TextAreaComponent;
        };
        'DateTime': {
            'meta': typeof DateTime;
            'comp': typeof DateTimeComponent;
        };
        'Container': {
            'meta': typeof Container;
            'comp': (typeof TextBlockComponent | typeof GenericGroupComponent)[];
        };
        'TabOrAccordionContainer': {
            'meta': typeof TabOrAccordionContainer;
            'comp': typeof TabOrAccordionContainerComponent;
        };
        'ButtonBarContainer': {
            'meta': typeof ButtonBarContainer;
            'comp': typeof ButtonBarContainerComponent;
        };
        'AnchorOrButton': {
            'meta': typeof AnchorOrButton;
            'comp': typeof AnchorOrButtonComponent;
        };
        'SaveButton': {
            'meta': typeof SaveButton;
            'comp': typeof SaveButtonComponent;
        };
        'CancelButton': {
            'meta': typeof CancelButton;
            'comp': typeof CancelButtonComponent;
        };
        'VocabField': {
            'meta': typeof VocabField;
            'comp': typeof VocabFieldComponent;
            'lookupService': string;
        };
        'RepeatableContainer': {
            'meta': typeof RepeatableContainer;
            'comp': typeof RepeatableVocabComponent[];
        };
        'ContributorField': {
            'meta': typeof ContributorField;
            'comp': typeof ContributorComponent;
            'lookupService': string;
        };
        'HiddenValue': {
            'meta': typeof HiddenValue;
            'comp': typeof HiddenValueComponent;
        };
        'WorkflowStepButton': {
            'meta': typeof WorkflowStepButton;
            'comp': typeof WorkflowStepButtonComponent;
        };
        'LinkValueComponent': {
            'meta': typeof LinkValue;
            'comp': typeof LinkValueComponent;
        };
        'SelectionField': {
            'meta': typeof SelectionField;
            'comp': typeof DropdownFieldComponent[];
        };
        'RelatedObjectDataField': {
            'meta': typeof RelatedObjectDataField;
            'comp': typeof RelatedObjectDataComponent;
            'lookupService': string;
        };
        'MapField': {
            'meta': typeof MapField;
            'comp': typeof MapComponent;
            'lookupService': string;
        };
    };
    constructor(vocabFieldLookupService: VocabFieldLookupService, completerService: CompleterService, configService: ConfigService, translationService: TranslationService, utilityService: UtilityService, app: ApplicationRef);
    addComponentClasses(componentClasses: object): void;
    getEmptyFormGroup(): FormGroup;
    toFormGroup(fields: FieldBase<any>[], fieldMap?: any): FormGroup;
    setupEventHandlers(fieldMap: any): void;
    populateFormGroup(fields: any[], group: any, fieldMap: any): any;
    getFieldsMeta(fieldsArr: any): any;
    flattenFields(fields: any[], fieldArr: any[]): void;
    getLookupData(fields: any[]): Observable<any[]>;
}
