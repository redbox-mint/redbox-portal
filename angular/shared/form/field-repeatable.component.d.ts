import { OnInit, EventEmitter } from '@angular/core';
import { SimpleComponent } from './field-simple.component';
import { Container } from './field-simple';
/**
 * Repeatable Field Container
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
export declare class RepeatableContainer extends Container {
    addButtonText: string;
    removeButtonText: string;
    skipClone: string[];
    forceClone: any[];
    addButtonTextClass: any;
    removeButtonTextClass: any;
    addButtonClass: any;
    removeButtonClass: any;
    constructor(options: any, injector: any);
    getInitArrayEntry(): any[];
    getGroup(group: any, fieldMap: any): void;
    createNewElem(baseFieldInst: any, value?: any): any;
    getCloneCustomizer(cloneOpts: any): (value: any, key: any) => boolean;
    addElem(): any;
    removeElem(index: number): void;
    triggerValidation(): void;
}
export declare class EmbeddableComponent extends SimpleComponent {
    canRemove: boolean;
    removeBtnText: string;
    removeBtnClass: string;
    index: number;
    onRemoveBtnClick: EventEmitter<any>;
    onRemove(event: any): void;
    getGroupClass(fldName?: string): string;
}
export declare class RepeatableComponent extends SimpleComponent {
    field: RepeatableContainer;
    addElem(event: any): void;
    removeElem(event: any, i: number): void;
}
export declare class RepeatableVocabComponent extends RepeatableComponent {
}
export declare class RepeatableContributor extends RepeatableContainer {
}
export declare class RepeatableContributorComponent extends RepeatableComponent implements OnInit {
    field: RepeatableContributor;
    ngOnInit(): void;
    addElem(event: any): void;
    removeElem(event: any, i: number): void;
}
