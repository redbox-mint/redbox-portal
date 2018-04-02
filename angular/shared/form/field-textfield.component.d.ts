import { EmbeddableComponent, RepeatableComponent } from './field-repeatable.component';
export declare class TextFieldComponent extends EmbeddableComponent {
}
export declare class RepeatableTextfieldComponent extends RepeatableComponent {
    ngOnInit(): void;
    addElem(event: any): void;
    removeElem(event: any, i: number): void;
}
