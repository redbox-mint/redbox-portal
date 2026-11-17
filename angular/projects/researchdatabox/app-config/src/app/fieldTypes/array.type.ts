import { Component, ElementRef, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { FieldArrayType } from '@ngx-formly/core';

@Component({
    selector: 'formly-array-type',
    template: `
    <div class="mb-3">
      @if (props.label) {
        <legend>{{ props.label }}</legend>
      }
      @if (props.description) {
        <p>{{ props.description }}</p>
      }
    
      @if (showError && formControl.errors) {
        <div class="alert alert-danger" role="alert">
          <formly-validation-message [field]="field"></formly-validation-message>
        </div>
      }
    
      @for (field of field.fieldGroup; track field; let i = $index) {
        <div class="app-config-array-item d-flex gap-2 align-items-start mb-3">
          <formly-field class="flex-grow-1" [field]="field"></formly-field>
          <div class="text-end">
            <button #removeButton type="button" (click)="remove(i)"
            class="btn btn-sm btn-outline-danger" [attr.aria-label]="'admin-config-remove-item' | i18next: { number: i + 1 }">×</button>
          </div>
        </div>
      }
    
      <div class="row">
        <span class="col-xs-12">
          <button #addButton type='button' (click)="add()"
          class="btn btn-sm btn-outline-secondary">+ {{ 'admin-config-add-item' | i18next }}</button>
        </span>
      </div>
    </div>
    `,
    standalone: false
})
export class ArrayTypeComponent extends FieldArrayType {
  @ViewChildren('removeButton') removeButtons!: QueryList<ElementRef<HTMLButtonElement>>;
  @ViewChild('addButton') addButton?: ElementRef<HTMLButtonElement>;

  override remove(index: number): void {
    super.remove(index);
    setTimeout(() => {
      const buttons = this.removeButtons.toArray();
      (buttons[Math.min(index, buttons.length - 1)]?.nativeElement ?? this.addButton?.nativeElement)?.focus();
    });
  }
}
