import { Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { Subscription } from 'rxjs';
import { FieldArrayType } from '@ngx-formly/core';

@Component({
  selector: 'app-config-chips',
  standalone: false,
  template: `
    <div class="mb-3">
      <label [for]="id + '-add'">{{ props.label || field.key }}</label>
      <div class="app-config-chips form-control" [class.is-invalid]="showError || invalidChip">
        @for (child of field.fieldGroup; track child; let i = $index) {
          <span class="rb-admin-chip" [class.app-config-invalid-chip]="child.formControl?.invalid">
            {{ child.formControl?.value }}
            <button #removeButton type="button" [disabled]="props.disabled" [attr.aria-label]="'admin-config-remove-chip' | i18next: { value: child.formControl?.value }" (click)="remove(i)">×</button>
          </span>
        }
        <input #entry type="text" [id]="id + '-add'" [disabled]="!!props.disabled" [attr.aria-invalid]="showError || invalidChip || hasInvalidChildren" [attr.aria-describedby]="id + '-hint' + (showError || hasInvalidChildren ? ' ' + id + '-errors' : '')" [placeholder]="'admin-config-chip-placeholder' | i18next" (input)="draftChanged(entry)" (keydown.enter)="commit($event, entry)" (keydown.comma)="commit($event, entry)" (blur)="commit($event, entry)">
      </div>
      <p class="rb-admin-hint" [id]="id + '-hint'">{{ (invalidChip ? 'admin-config-chip-invalid' : 'admin-config-chip-hint') | i18next }}</p>
      <div [id]="id + '-errors'">
      @if (showError) { <div class="invalid-feedback d-block"><formly-validation-message [field]="field"></formly-validation-message></div> }
      @for (child of field.fieldGroup; track child) {
        @if (child.formControl?.invalid) { <div class="text-danger"><formly-validation-message [field]="child"></formly-validation-message></div> }
      }
      </div>
    </div>
  `
})
export class ChipsTypeComponent extends FieldArrayType implements OnInit, OnDestroy {
  @ViewChild('entry') entry?: ElementRef<HTMLInputElement>;
  @ViewChildren('removeButton') removeButtons!: QueryList<ElementRef<HTMLButtonElement>>;
  private changes?: Subscription;

  override remove(index: number): void {
    super.remove(index);
    setTimeout(() => {
      const buttons = this.removeButtons.toArray();
      (buttons[Math.min(index, buttons.length - 1)]?.nativeElement ?? this.entry?.nativeElement)?.focus();
    });
  }

  ngOnInit(): void {
    this.changes = this.formControl.valueChanges.subscribe(() => {
      // Validation emits valueChanges too; retain rejected text until committed or discarded.
      if (!this.options?.formState?.chipDrafts?.has(this.field) && this.entry) this.entry.nativeElement.value = '';
    });
  }
  ngOnDestroy(): void {
    this.changes?.unsubscribe();
    this.options?.formState?.chipDrafts?.delete(this.field);
  }

  draftChanged(input: HTMLInputElement): void {
    const drafts = this.options?.formState?.chipDrafts;
    if (input.value) drafts?.add(this.field); else drafts?.delete(this.field);
    if (!input.value.trim() && this.invalidChip) this.formControl.updateValueAndValidity();
  }

  get hasInvalidChildren(): boolean { return !!this.field.fieldGroup?.some(child => child.formControl?.invalid); }

  get invalidChip(): boolean { return !!this.formControl.errors?.['chip']; }

  commit(event: Event, input: HTMLInputElement): void {
    if (event.type === 'keydown') event.preventDefault();
    this.draftChanged(input);
    const text = input.value.trim();
    if (!text) {
      if (this.invalidChip) this.formControl.updateValueAndValidity();
      return;
    }
    const numeric = ['integer', 'number'].includes(this.props['chipType']);
    const normalize = this.props['normalizeChip'];
    const value = numeric ? Number(text) : normalize ? normalize(text) : text;
    if (normalize && this.model.some((rule: string) => normalize(rule) === value)) {
      input.value = '';
      this.draftChanged(input);
      return;
    }
    if (numeric && !Number.isFinite(value)) {
      this.formControl.setErrors({ ...this.formControl.errors, chip: true });
      return;
    }
    this.formControl.updateValueAndValidity();
    this.add(undefined, value);
    // FieldArrayType treats falsy initial values as undefined; preserve numeric zero.
    this.model[this.model.length - 1] = value;
    this.formControl.at(this.formControl.length - 1).setValue(value);
    input.value = '';
    this.draftChanged(input);
  }
}
